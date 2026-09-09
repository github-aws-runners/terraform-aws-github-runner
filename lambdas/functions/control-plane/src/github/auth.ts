import { createAppAuth, type AppAuthentication, type InstallationAccessTokenAuthentication } from '@octokit/auth-app';
import type { OctokitOptions, Octokit as CoreOctokit } from '@octokit/core';
import type { RequestInterface } from '@octokit/types';
import { createSign, randomUUID } from 'node:crypto';
import { request } from '@octokit/request';
import { Octokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';
import { throttling } from '@octokit/plugin-throttling';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import {
  createCommonStorage,
  type GitHubAppCredential,
  type GitHubAppCredentialsStore,
} from '@aws-github-runner/storage-providers';
import { EndpointDefaults } from '@octokit/types';

type AppAuthOptions = { type: 'app' };
type InstallationAuthOptions = { type: 'installation'; installationId?: number };
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

const logger = createChildLogger('gh-auth');
const MAX_RATE_LIMIT_RETRIES = 2;
const MAX_SECONDARY_RATE_LIMIT_RETRIES = 1;

export function onRateLimit(
  retryAfter: number,
  options: Required<EndpointDefaults>,
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

interface AppRateLimitState {
  remaining: number;
  cooldownUntil: number;
}

// Last known primary rate limit remaining and secondary rate limit cooldown
// per app index. Fed by response headers and throttling callbacks; persists
// across invocations in a warm lambda so selection converges quickly.
const appRateLimitStates = new Map<number, AppRateLimitState>();
const SECONDARY_RATE_LIMIT_COOLDOWN_MS = 60_000;

export function reportAppRateLimit(appIndex: number, remaining: number): void {
  const state = appRateLimitStates.get(appIndex) ?? { remaining, cooldownUntil: 0 };
  state.remaining = remaining;
  appRateLimitStates.set(appIndex, state);
}

export function reportAppSecondaryRateLimit(appIndex: number): void {
  const state = appRateLimitStates.get(appIndex) ?? { remaining: 0, cooldownUntil: 0 };
  state.cooldownUntil = Date.now() + SECONDARY_RATE_LIMIT_COOLDOWN_MS;
  appRateLimitStates.set(appIndex, state);
  logger.warn(`GitHub App index ${appIndex} put in secondary rate limit cooldown`);
}

// Select the app with the most primary rate limit budget remaining, skipping
// apps cooling down after a secondary rate limit. Apps with no observed state
// are assumed full. Iteration starts at a random offset so concurrent
// cold-started lambdas do not all converge on the same app.
async function selectAppIndex(credentialsStore?: GitHubAppCredentialsStore): Promise<number> {
  const credentials = await getAppCredentials(credentialsStore);
  if (credentials.length === 1) return 0;
  const now = Date.now();
  const offset = Math.floor(Math.random() * credentials.length);
  let best = -1;
  let bestRemaining = -1;
  for (let n = 0; n < credentials.length; n++) {
    const i = (offset + n) % credentials.length;
    const state = appRateLimitStates.get(i);
    if (state && state.cooldownUntil > now) continue;
    const remaining = state?.remaining ?? Number.MAX_SAFE_INTEGER;
    if (remaining > bestRemaining) {
      bestRemaining = remaining;
      best = i;
    }
  }
  if (best === -1) {
    // Every app is cooling down; pick the one with the most remaining anyway.
    for (let i = 0; i < credentials.length; i++) {
      const remaining = appRateLimitStates.get(i)?.remaining ?? Number.MAX_SAFE_INTEGER;
      if (remaining > bestRemaining) {
        bestRemaining = remaining;
        best = i;
      }
    }
  }
  // Info so the app selection distribution is observable at default log level.
  logger.info(`Selected GitHub App index ${best} with ${bestRemaining} rate limit remaining`);
  return best;
}

async function loadAppCredentials(): Promise<GitHubAppCredential[]> {
  const credentials = await createCommonStorage().githubAppCredentials.get();
  logger.info(`Loaded ${credentials.length} GitHub App credential(s)`);
  return credentials;
}

function getAppCredentials(credentialsStore?: GitHubAppCredentialsStore): Promise<GitHubAppCredential[]> {
  if (credentialsStore) {
    return credentialsStore.get();
  }
  if (!appCredentialsPromise) appCredentialsPromise = loadAppCredentials();
  return appCredentialsPromise;
}

export async function getAppCount(credentialsStore?: GitHubAppCredentialsStore): Promise<number> {
  return (await getAppCredentials(credentialsStore)).length;
}

export function resetAppCredentialsCache(): void {
  appCredentialsPromise = null;
  appRateLimitStates.clear();
}

export async function getStoredInstallationId(
  appIndex: number,
  credentialsStore?: GitHubAppCredentialsStore,
): Promise<number | undefined> {
  const credentials = await getAppCredentials(credentialsStore);
  return credentials[appIndex]?.installationId;
}

export async function getAppId(appIndex = 0, credentialsStore?: GitHubAppCredentialsStore): Promise<string> {
  const credential = (await getAppCredentials(credentialsStore))[appIndex];
  if (!credential) {
    throw new Error(`GitHub App credential at index ${appIndex} not found`);
  }
  return credential.appId.toString();
}

export async function createOctokitClient(token: string, ghesApiUrl = '', appIndex?: number): Promise<Octokit> {
  const CustomOctokit = Octokit.plugin(retry, throttling);
  const octokitOptions: OctokitOptions = { auth: token };
  if (ghesApiUrl) {
    octokitOptions.baseUrl = ghesApiUrl;
    octokitOptions.previews = ['antiope'];
  }

  return new CustomOctokit({
    ...octokitOptions,
    userAgent: process.env.USER_AGENT || 'github-aws-runners',
    retry: {
      onRetry: (retryCount: number, error: Error, retryRequest: { method: string; url: string }) => {
        logger.warn('GitHub API request retry attempt', {
          retryCount,
          method: retryRequest.method,
          url: retryRequest.url,
          error: error.message,
          status: (error as Error & { status?: number }).status,
        });
      },
    },
    throttle: {
      onRateLimit: (
        retryAfter: number,
        options: Required<EndpointDefaults>,
        octokit: CoreOctokit,
        retryCount: number,
      ) => {
        if (appIndex !== undefined) {
          // Primary budget exhausted for this app; steer new flows elsewhere.
          reportAppRateLimit(appIndex, 0);
        }
        return onRateLimit(retryAfter, options, octokit, retryCount);
      },
      onSecondaryRateLimit: (
        retryAfter: number,
        options: Required<EndpointDefaults>,
        octokit: CoreOctokit,
        retryCount: number,
      ) => {
        if (appIndex !== undefined) {
          reportAppSecondaryRateLimit(appIndex);
        }
        return onSecondaryRateLimit(retryAfter, options, octokit, retryCount);
      },
    },
  });
}

export async function createGithubAppAuth(
  installationId: number | undefined,
  ghesApiUrl = '',
  appIndex?: number,
  credentialsStore?: GitHubAppCredentialsStore,
): Promise<AppAuthentication & { appIndex: number }> {
  const idx = appIndex ?? (await selectAppIndex(credentialsStore));
  const auth = await createAuth(installationId, ghesApiUrl, idx, credentialsStore);
  return { ...(await auth({ type: 'app' })), appIndex: idx };
}

export async function createGithubInstallationAuth(
  installationId: number | undefined,
  ghesApiUrl = '',
  appIndex?: number,
  credentialsStore?: GitHubAppCredentialsStore,
): Promise<InstallationAccessTokenAuthentication> {
  const idx = appIndex ?? (await selectAppIndex(credentialsStore));
  const auth = await createAuth(installationId, ghesApiUrl, idx, credentialsStore);
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
  credentialsStore?: GitHubAppCredentialsStore,
): Promise<AuthInterface> {
  const credentials = await getAppCredentials(credentialsStore);
  const selected =
    appIndex !== undefined ? credentials[appIndex] : credentials[Math.floor(Math.random() * credentials.length)];
  if (!selected) {
    throw new Error(`GitHub App credential at index ${appIndex ?? 0} not found`);
  }

  logger.debug(`Selected GitHub App ${selected.appId} for authentication`);
  const createJwt = async (appId: string | number, timeDifference?: number) => {
    const now = Math.floor(Date.now() / 1000) + (timeDifference ?? 0);
    const iat = now - 30;
    const exp = iat + 600;
    const jwt = signJwt({ iat, exp, iss: appId, jti: randomUUID() }, selected.privateKey);
    return { jwt, expiresAt: new Date(exp * 1000).toISOString() };
  };

  const authOptions: StrategyOptions = {
    appId: selected.appId,
    createJwt,
    ...(installationId ? { installationId } : {}),
  };
  if (ghesApiUrl) {
    authOptions.request = request.defaults({ baseUrl: ghesApiUrl });
  }
  return createAppAuth(authOptions);
}
