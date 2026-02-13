import { createAppAuth, type AppAuthentication, type InstallationAccessTokenAuthentication } from '@octokit/auth-app';
import type { OctokitOptions } from '@octokit/core';
import type { RequestInterface } from '@octokit/types';

// Define types that are not directly exported
type AppAuthOptions = { type: 'app' };
type InstallationAuthOptions = { type: 'installation'; installationId?: number };
// Use a more generalized AuthInterface to match what createAppAuth returns
type AuthInterface = {
  (options: AppAuthOptions): Promise<AppAuthentication>;
  (options: InstallationAuthOptions): Promise<InstallationAccessTokenAuthentication>;
};
type StrategyOptions = {
  appId: number;
  createJwt: (appId: string | number, timeDifference?: number) => Promise<{ jwt: string; expiresAt: string }>;
  installationId?: number;
  request?: RequestInterface;
};
import { createSign, randomUUID } from 'node:crypto';
import { request } from '@octokit/request';
import { Octokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';
import { throttling } from '@octokit/plugin-throttling';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { getParameters } from '@aws-github-runner/aws-ssm-util';
import { EndpointDefaults } from '@octokit/types';

const logger = createChildLogger('gh-auth');

interface GitHubAppCredential {
  appId: number;
  privateKey: string;
  installationId?: number;
}

let appCredentialsPromise: Promise<GitHubAppCredential[]> | null = null;

async function loadAppCredentials(): Promise<GitHubAppCredential[]> {
  const idParams = process.env.PARAMETER_GITHUB_APP_ID_NAME.split(':').filter(Boolean);
  const keyParams = process.env.PARAMETER_GITHUB_APP_KEY_BASE64_NAME.split(':').filter(Boolean);
  const installationIdParams = (process.env.PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME || '').split(':');
  if (idParams.length !== keyParams.length) {
    throw new Error(`GitHub App parameter count mismatch: ${idParams.length} IDs vs ${keyParams.length} keys`);
  }
  // Batch fetch all SSM parameters in a single call to reduce API calls
  const allParamNames = [
    ...idParams,
    ...keyParams,
    ...installationIdParams.filter((p) => p.length > 0),
  ];
  const params = await getParameters(allParamNames);

  const credentials: GitHubAppCredential[] = [];
  for (let i = 0; i < idParams.length; i++) {
    const appIdValue = params.get(idParams[i]);
    if (!appIdValue) {
      throw new Error(`Parameter ${idParams[i]} not found`);
    }
    const appId = parseInt(appIdValue);
    const privateKeyBase64 = params.get(keyParams[i]);
    if (!privateKeyBase64) {
      throw new Error(`Parameter ${keyParams[i]} not found`);
    }
    // replace literal \n characters with new lines to allow the key to be stored as a
    // single line variable. This logic should match how the GitHub Terraform provider
    // processes private keys to retain compatibility between the projects
    const privateKey = Buffer.from(privateKeyBase64, 'base64').toString().replace('/[\\n]/g', String.fromCharCode(10));
    const installationIdParam = installationIdParams[i];
    const installationId =
      installationIdParam && installationIdParam.length > 0
        ? parseInt(params.get(installationIdParam) || '')
        : undefined;
    credentials.push({ appId, privateKey, installationId });
  }
  logger.info(`Loaded ${credentials.length} GitHub App credential(s)`);
  return credentials;
}

function getAppCredentials(): Promise<GitHubAppCredential[]> {
  if (!appCredentialsPromise) appCredentialsPromise = loadAppCredentials();
  return appCredentialsPromise;
}

export async function getAppCount(): Promise<number> {
  return (await getAppCredentials()).length;
}

export function resetAppCredentialsCache(): void {
  appCredentialsPromise = null;
}

export async function getStoredInstallationId(appIndex: number): Promise<number | undefined> {
  const credentials = await getAppCredentials();
  return credentials[appIndex]?.installationId;
}

export async function createOctokitClient(token: string, ghesApiUrl = ''): Promise<Octokit> {
  const CustomOctokit = Octokit.plugin(retry, throttling);
  const ocktokitOptions: OctokitOptions = {
    auth: token,
  };
  if (ghesApiUrl) {
    ocktokitOptions.baseUrl = ghesApiUrl;
    ocktokitOptions.previews = ['antiope'];
  }

  return new CustomOctokit({
    ...ocktokitOptions,
    userAgent: process.env.USER_AGENT || 'github-aws-runners',
    retry: {
      onRetry: (retryCount: number, error: Error, request: { method: string; url: string }) => {
        logger.warn('GitHub API request retry attempt', {
          retryCount,
          method: request.method,
          url: request.url,
          error: error.message,
          status: (error as Error & { status?: number }).status,
        });
      },
    },
    throttle: {
      onRateLimit: (retryAfter: number, options: Required<EndpointDefaults>) => {
        logger.warn(
          `GitHub rate limit: Request quota exhausted for request ${options.method} ${options.url}. Requested `,
        );
      },
      onSecondaryRateLimit: (retryAfter: number, options: Required<EndpointDefaults>) => {
        logger.warn(`GitHub rate limit: SecondaryRateLimit detected for request ${options.method} ${options.url}`);
      },
    },
  });
}

export async function createGithubAppAuth(
  installationId: number | undefined,
  ghesApiUrl = '',
  appIndex?: number,
): Promise<AppAuthentication & { appIndex: number }> {
  const credentials = await getAppCredentials();
  const idx = appIndex ?? Math.floor(Math.random() * credentials.length);
  const auth = await createAuth(installationId, ghesApiUrl, idx);
  const result = await auth({ type: 'app' });
  return { ...result, appIndex: idx };
}

export async function createGithubInstallationAuth(
  installationId: number | undefined,
  ghesApiUrl = '',
  appIndex?: number,
): Promise<InstallationAccessTokenAuthentication> {
  const credentials = await getAppCredentials();
  const idx = appIndex ?? Math.floor(Math.random() * credentials.length);
  const auth = await createAuth(installationId, ghesApiUrl, idx);
  return auth({ type: 'installation', installationId });
}

function signJwt(payload: Record<string, unknown>, privateKey: string): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encode = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const message = `${encode(header)}.${encode(payload)}`;
  const signature = createSign('RSA-SHA256').update(message).sign(privateKey, 'base64url');
  return `${message}.${signature}`;
}

async function createAuth(
  installationId: number | undefined,
  ghesApiUrl: string,
  appIndex?: number,
): Promise<AuthInterface> {
  const credentials = await getAppCredentials();
  const selected =
    appIndex !== undefined ? credentials[appIndex] : credentials[Math.floor(Math.random() * credentials.length)];

  logger.debug(`Selected GitHub App ${selected.appId} for authentication`);

  // Use a custom createJwt callback to include a jti (JWT ID) claim in every token.
  // Without this, concurrent Lambda invocations generating JWTs within the same second
  // produce byte-identical tokens (same iat, exp, iss), which GitHub rejects as duplicates.
  // See: https://github.com/github-aws-runners/terraform-aws-github-runner/issues/5025
  const createJwt = async (appId: string | number, timeDifference?: number) => {
    const now = Math.floor(Date.now() / 1000) + (timeDifference ?? 0);
    const iat = now - 30;
    const exp = iat + 600;
    const jwt = signJwt({ iat, exp, iss: appId, jti: randomUUID() }, selected.privateKey);
    return { jwt, expiresAt: new Date(exp * 1000).toISOString() };
  };

  let authOptions: StrategyOptions = { appId: selected.appId, createJwt };
  if (installationId) authOptions = { ...authOptions, installationId };

  logger.debug(`GHES API URL: ${ghesApiUrl}`);
  if (ghesApiUrl) {
    authOptions.request = request.defaults({
      baseUrl: ghesApiUrl,
    });
  }
  return createAppAuth(authOptions);
}
