import { createAppAuth, type AppAuthentication, type InstallationAccessTokenAuthentication } from '@octokit/auth-app';
import type { OctokitOptions, Octokit as CoreOctokit } from '@octokit/core';
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
import { getGitHubAppCredentialsStore, type GitHubAppCredential } from '@aws-github-runner/storage-providers';
import { EndpointDefaults } from '@octokit/types';

const logger = createChildLogger('gh-auth');

// Retry caps for the throttling plugin. Returning `true` from a limit handler tells
// the plugin to retry after the interval GitHub asked for; returning `false` gives up.
// Primary rate limits reset on a fixed schedule, so a couple of retries is worthwhile.
// Secondary rate limits are abuse-detection signals — retry once, then back off and
// let the message return to the queue rather than pushing harder.
const MAX_RATE_LIMIT_RETRIES = 2;
const MAX_SECONDARY_RATE_LIMIT_RETRIES = 1;

// Exported for tests: the plugin only surfaces these via the client constructor,
// so there is no other seam to assert the retry cap against.
export function onRateLimit(
  retryAfter: number,
  options: Required<EndpointDefaults>,
  // The throttling plugin types this as @octokit/core's Octokit, not the wider
  // @octokit/rest one imported above; matching it keeps the handler assignable to
  // the plugin's LimitHandler. Unused here regardless.
  _octokit: CoreOctokit,
  retryCount: number,
): boolean {
  logger.warn(
    `GitHub rate limit: Request quota exhausted for request ${options.method} ${options.url}, ` +
      `retrying after ${retryAfter}s`,
  );
  return retryCount < MAX_RATE_LIMIT_RETRIES;
}

export function onSecondaryRateLimit(
  retryAfter: number,
  options: Required<EndpointDefaults>,
  // The throttling plugin types this as @octokit/core's Octokit, not the wider
  // @octokit/rest one imported above; matching it keeps the handler assignable to
  // the plugin's LimitHandler. Unused here regardless.
  _octokit: CoreOctokit,
  retryCount: number,
): boolean {
  logger.warn(
    `GitHub rate limit: SecondaryRateLimit detected for request ${options.method} ${options.url}, ` +
      `retrying after ${retryAfter}s`,
  );
  return retryCount < MAX_SECONDARY_RATE_LIMIT_RETRIES;
}

let appCredentialsPromise: Promise<GitHubAppCredential[]> | null = null;

async function loadAppCredentials(): Promise<GitHubAppCredential[]> {
  const credentials = await getGitHubAppCredentialsStore().get();
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

export async function getAppId(appIndex = 0): Promise<string> {
  const credential = (await getAppCredentials())[appIndex];
  if (!credential) {
    throw new Error(`GitHub App credential at index ${appIndex} not found`);
  }
  return credential.appId.toString();
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
      onRateLimit,
      onSecondaryRateLimit,
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
