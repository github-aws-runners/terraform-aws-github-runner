import { createAppAuth } from '@octokit/auth-app';
import { request } from '@octokit/request';
import { createHash } from 'node:crypto';

import {
  githubApiUrl,
  parseGitHubConfigUrl,
  type AccessToken,
  type ScaleSetFetch,
} from '@aws-github-runner/github-actions-scale-set';

import { ScaleSetConfigurationError, type GitHubAppParameterReferences } from './config';

export interface ParameterStore {
  get(names: readonly string[]): Promise<ReadonlyMap<string, string>>;
  put?(name: string, value: string): Promise<void>;
}

interface GitHubAppCredentials {
  appId: string;
  installationId?: number;
  privateKey: string;
}

interface GitHubAppInstallation {
  id?: unknown;
  account?: { login?: unknown };
}

interface GitHubAppInstallationsResponse {
  installations?: unknown;
}

const MAX_PRIVATE_KEY_BYTES = 64 * 1024;

function requiredParameter(values: ReadonlyMap<string, string>, name: string): string {
  const value = values.get(name);
  if (value === undefined || value === '') {
    throw new ScaleSetConfigurationError(`required SSM parameter ${JSON.stringify(name)} was not returned`);
  }
  return value;
}

function decodePrivateKey(encoded: string): string {
  if (
    encoded.length === 0 ||
    encoded.length > Math.ceil((MAX_PRIVATE_KEY_BYTES * 4) / 3) + 4 ||
    encoded.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
  ) {
    throw new ScaleSetConfigurationError('GitHub App private key parameter must contain canonical base64');
  }
  const decoded = Buffer.from(encoded, 'base64').toString('utf8').replace(/\\n/g, '\n');
  if (Buffer.byteLength(decoded, 'utf8') > MAX_PRIVATE_KEY_BYTES) {
    throw new ScaleSetConfigurationError('GitHub App private key is too large');
  }
  if (!/^-----BEGIN (?:RSA )?PRIVATE KEY-----\n[\s\S]+\n-----END (?:RSA )?PRIVATE KEY-----\n?$/.test(decoded)) {
    throw new ScaleSetConfigurationError('GitHub App private key parameter is not a supported PEM private key');
  }
  return decoded;
}

export async function loadGitHubAppCredentials(
  references: GitHubAppParameterReferences,
  parameterStore: ParameterStore,
): Promise<GitHubAppCredentials> {
  const names = [references.appIdParameterName, references.privateKeyParameterName];
  if (references.installationIdParameterName !== undefined) names.splice(1, 0, references.installationIdParameterName);
  const values = await parameterStore.get(names);
  const appId = requiredParameter(values, references.appIdParameterName).trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(appId)) {
    throw new ScaleSetConfigurationError('GitHub App ID parameter is invalid');
  }
  let installationId: number | undefined;
  if (references.installationIdParameterName !== undefined) {
    const installationIdRaw = values.get(references.installationIdParameterName)?.trim();
    if (installationIdRaw !== undefined && installationIdRaw !== '') {
      if (!/^\d+$/.test(installationIdRaw)) {
        throw new ScaleSetConfigurationError('GitHub App installation ID parameter must be a positive integer');
      }
      installationId = Number(installationIdRaw);
      if (!Number.isSafeInteger(installationId) || installationId <= 0) {
        throw new ScaleSetConfigurationError('GitHub App installation ID parameter must be a positive integer');
      }
    }
  }
  return {
    appId,
    installationId,
    privateKey: decodePrivateKey(requiredParameter(values, references.privateKeyParameterName)),
  };
}

async function discoverGitHubAppInstallationId(
  credentials: Pick<GitHubAppCredentials, 'appId' | 'privateKey'>,
  target: string,
  apiBaseUrl: string,
  fetchImplementation: ScaleSetFetch,
): Promise<number> {
  const appRequest = request.defaults({ baseUrl: apiBaseUrl, request: { fetch: fetchImplementation } });
  const appAuth = createAppAuth({
    appId: credentials.appId,
    privateKey: credentials.privateKey,
    request: appRequest,
  });
  const appAuthentication = await appAuth({ type: 'app' });
  for (let page = 1; page <= 100; page += 1) {
    const url = new URL('/app/installations', `${apiBaseUrl}/`);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    const response = await fetchImplementation(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${appAuthentication.token}`,
        'User-Agent': 'github-aws-runners/scale-set-controller',
      },
    });
    if (!response.ok) {
      throw new ScaleSetConfigurationError(`GitHub App installation discovery failed with HTTP ${response.status}`);
    }
    let payload: GitHubAppInstallationsResponse;
    try {
      payload = (await response.json()) as GitHubAppInstallationsResponse;
    } catch (error) {
      throw new ScaleSetConfigurationError('GitHub App installation discovery returned invalid JSON', { cause: error });
    }
    if (!Array.isArray(payload.installations)) {
      throw new ScaleSetConfigurationError('GitHub App installation discovery returned an invalid response');
    }
    for (const value of payload.installations as unknown[]) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
      const candidate = value as GitHubAppInstallation;
      if (
        Number.isSafeInteger(candidate.id) &&
        typeof candidate.account?.login === 'string' &&
        candidate.account.login.toLowerCase() === target.toLowerCase()
      ) {
        return candidate.id as number;
      }
    }
    if (payload.installations.length < 100) break;
  }
  throw new ScaleSetConfigurationError(`GitHub App is not installed for ${JSON.stringify(target)}`);
}

export async function createGitHubAppAccessTokenProvider(
  references: GitHubAppParameterReferences,
  githubConfigUrl: string,
  forceGhes: boolean,
  parameterStore: ParameterStore,
  fetchImplementation: ScaleSetFetch = globalThis.fetch,
): Promise<() => Promise<AccessToken>> {
  const parsedConfig = parseGitHubConfigUrl(githubConfigUrl, forceGhes);
  const apiBaseUrl = githubApiUrl(parsedConfig, '/').toString().replace(/\/$/, '');
  let cached:
    | {
        fingerprint: string;
        installationId: number;
        auth: ReturnType<typeof createAppAuth>;
      }
    | undefined;
  let discovered:
    | {
        fingerprint: string;
        installationId: number;
      }
    | undefined;

  return async () => {
    // Reload references for rotation visibility, but preserve the Octokit auth
    // instance while credentials are unchanged so its installation-token cache
    // remains effective.
    const credentials = await loadGitHubAppCredentials(references, parameterStore);
    const credentialFingerprint = createHash('sha256')
      .update(credentials.appId)
      .update('\u0000')
      .update(credentials.privateKey)
      .digest('base64url');
    const target = parsedConfig.organization ?? parsedConfig.enterprise;
    if (credentials.installationId === undefined && target === undefined) {
      throw new ScaleSetConfigurationError(
        'GitHub App installation discovery requires an organization or enterprise URL',
      );
    }
    let installationId = credentials.installationId;
    if (installationId === undefined) {
      if (discovered?.fingerprint === credentialFingerprint) {
        installationId = discovered.installationId;
      } else {
        installationId = await discoverGitHubAppInstallationId(credentials, target!, apiBaseUrl, fetchImplementation);
        discovered = { fingerprint: credentialFingerprint, installationId };
        if (references.installationIdParameterName !== undefined && parameterStore.put !== undefined) {
          await parameterStore.put(references.installationIdParameterName, String(installationId));
        }
      }
    }
    const fingerprint = `${credentialFingerprint}\u0000${installationId}`;
    if (cached?.fingerprint !== fingerprint) {
      cached = {
        fingerprint,
        installationId,
        auth: createAppAuth({
          appId: credentials.appId,
          installationId,
          privateKey: credentials.privateKey,
          request: request.defaults({ baseUrl: apiBaseUrl, request: { fetch: fetchImplementation } }),
        }),
      };
    }
    const installation = await cached.auth({ type: 'installation', installationId: cached.installationId });
    return { token: installation.token, expiresAt: installation.expiresAt };
  };
}
