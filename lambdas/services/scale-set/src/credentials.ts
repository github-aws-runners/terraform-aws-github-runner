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
}

interface GitHubAppCredentials {
  appId: string;
  installationId: number;
  privateKey: string;
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
  const values = await parameterStore.get([
    references.appIdParameterName,
    references.installationIdParameterName,
    references.privateKeyParameterName,
  ]);
  const appId = requiredParameter(values, references.appIdParameterName).trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(appId)) {
    throw new ScaleSetConfigurationError('GitHub App ID parameter is invalid');
  }
  const installationIdRaw = requiredParameter(values, references.installationIdParameterName).trim();
  if (!/^\d+$/.test(installationIdRaw)) {
    throw new ScaleSetConfigurationError('GitHub App installation ID parameter must be a positive integer');
  }
  const installationId = Number(installationIdRaw);
  if (!Number.isSafeInteger(installationId) || installationId <= 0) {
    throw new ScaleSetConfigurationError('GitHub App installation ID parameter must be a positive integer');
  }
  return {
    appId,
    installationId,
    privateKey: decodePrivateKey(requiredParameter(values, references.privateKeyParameterName)),
  };
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

  return async () => {
    // Reload references for rotation visibility, but preserve the Octokit auth
    // instance while credentials are unchanged so its installation-token cache
    // remains effective.
    const credentials = await loadGitHubAppCredentials(references, parameterStore);
    const fingerprint = createHash('sha256')
      .update(credentials.appId)
      .update('\u0000')
      .update(String(credentials.installationId))
      .update('\u0000')
      .update(credentials.privateKey)
      .digest('base64url');
    if (cached?.fingerprint !== fingerprint) {
      cached = {
        fingerprint,
        installationId: credentials.installationId,
        auth: createAppAuth({
          appId: credentials.appId,
          installationId: credentials.installationId,
          privateKey: credentials.privateKey,
          request: request.defaults({ baseUrl: apiBaseUrl, request: { fetch: fetchImplementation } }),
        }),
      };
    }
    const installation = await cached.auth({ type: 'installation', installationId: cached.installationId });
    return { token: installation.token, expiresAt: installation.expiresAt };
  };
}
