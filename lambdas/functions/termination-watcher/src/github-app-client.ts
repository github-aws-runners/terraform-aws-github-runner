import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import { request } from '@octokit/request';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { createCommonStorage, type GitHubAppCredential } from '@aws-github-runner/storage-providers';
import type { EndpointDefaults } from '@octokit/types';

const logger = createChildLogger('github-app-client');

let appCredentialsPromise: Promise<GitHubAppCredential[]> | undefined;

const appBudgets = new Map<string, { remaining: number; resetAt: number }>();
const cooldowns = new Map<string, number>();

function appKey(appId: number, endpoint: string): string {
  return JSON.stringify([endpoint, appId]);
}

function budgetKey(appId: number, endpoint: string, owner: string): string {
  return JSON.stringify([endpoint, appId, owner.split('/')[0].toLowerCase()]);
}

function budget(key: string) {
  const observed = appBudgets.get(key);
  if (observed && observed.resetAt <= Date.now()) {
    appBudgets.delete(key);
    return undefined;
  }
  return observed;
}

function coolDown(key: string, retryAfter = 60): void {
  cooldowns.set(key, Date.now() + Math.max(60, retryAfter) * 1000);
}

function selectCredential(credentials: GitHubAppCredential[], owner: string, endpoint: string): GitHubAppCredential {
  const offset = Math.floor(Math.random() * credentials.length);
  const rotated = [...credentials.slice(offset), ...credentials.slice(0, offset)];
  const available = rotated.filter((credential) => {
    const key = budgetKey(credential.appId, endpoint, owner);
    return (
      (cooldowns.get(key) ?? 0) <= Date.now() &&
      (cooldowns.get(appKey(credential.appId, endpoint)) ?? 0) <= Date.now() &&
      budget(key)?.remaining !== 0
    );
  });
  return (available.length ? available : rotated).reduce((best, credential) =>
    (budget(budgetKey(credential.appId, endpoint, owner))?.remaining ?? Infinity) >
    (budget(budgetKey(best.appId, endpoint, owner))?.remaining ?? Infinity)
      ? credential
      : best,
  );
}

export function createThrottleOptions(appId?: number, owner = '', endpoint = '') {
  return {
    onRateLimit: (retryAfter: number, options: Required<EndpointDefaults>) => {
      if (appId !== undefined) coolDown(budgetKey(appId, endpoint, owner), retryAfter);
      logger.warn(`Rate limit hit for ${options.method} ${options.url}`);
      return false;
    },
    onSecondaryRateLimit: (retryAfter: number, options: Required<EndpointDefaults>) => {
      if (appId !== undefined) coolDown(appKey(appId, endpoint), retryAfter);
      logger.warn(`Secondary rate limit hit for ${options.method} ${options.url}`);
      return false;
    },
  };
}

async function loadAppCredentials(): Promise<GitHubAppCredential[]> {
  const credentials = await createCommonStorage().githubAppCredentials.get();
  if (credentials.length === 0) {
    throw new Error('No GitHub App credentials found');
  }
  return credentials;
}

function getAppCredentials(): Promise<GitHubAppCredential[]> {
  if (!appCredentialsPromise) {
    appCredentialsPromise = loadAppCredentials().catch((error: unknown) => {
      appCredentialsPromise = undefined;
      throw error;
    });
  }
  return appCredentialsPromise;
}

export function resetAppCredentialsCache(): void {
  appCredentialsPromise = undefined;
  appBudgets.clear();
  cooldowns.clear();
}

function createOctokitInstance(token: string, ghesApiUrl: string, appId?: number, owner = ''): Octokit {
  const CustomOctokit = Octokit.plugin(throttling);
  const octokitOptions: ConstructorParameters<typeof Octokit>[0] = {
    auth: token,
  };
  if (ghesApiUrl) {
    octokitOptions.baseUrl = ghesApiUrl;
  }
  const client = new CustomOctokit({
    ...octokitOptions,
    userAgent: 'github-aws-runners-termination-watcher',
    throttle: createThrottleOptions(appId, owner, ghesApiUrl),
  });
  if (appId !== undefined)
    client.hook.after('request', (response) => {
      const remaining = Number.parseInt(String(response.headers['x-ratelimit-remaining']), 10);
      const resetAt = Number(response.headers['x-ratelimit-reset']) * 1000;
      if (Number.isFinite(remaining))
        appBudgets.set(budgetKey(appId, ghesApiUrl, owner), {
          remaining,
          resetAt: Number.isFinite(resetAt) && resetAt > 0 ? resetAt : Date.now() + 60000,
        });
    });
  return client;
}

async function createAuthenticatedClient(ghesApiUrl: string, credential: GitHubAppCredential): Promise<Octokit> {
  const { appId, privateKey } = credential;
  const authOptions: { appId: number; privateKey: string; request?: typeof request } = {
    appId,
    privateKey,
  };
  if (ghesApiUrl) {
    authOptions.request = request.defaults({ baseUrl: ghesApiUrl });
  }
  const auth = createAppAuth(authOptions);
  const appAuth = await auth({ type: 'app' });
  return createOctokitInstance(appAuth.token, ghesApiUrl);
}

async function getInstallationId(octokit: Octokit, owner: string): Promise<number> {
  const { data: installation } = await octokit.apps.getOrgInstallation({ org: owner });
  return installation.id;
}

async function getInstallationIdForRepo(octokit: Octokit, owner: string, repo: string): Promise<number> {
  const { data: installation } = await octokit.apps.getRepoInstallation({ owner, repo });
  return installation.id;
}

async function createInstallationClient(
  appOctokit: Octokit,
  owner: string,
  runnerType: string,
  ghesApiUrl: string,
  credential: GitHubAppCredential,
): Promise<Octokit> {
  let installationId: number;
  if (runnerType === 'Repo') {
    const [repoOwner, repo] = owner.split('/');
    installationId = await getInstallationIdForRepo(appOctokit, repoOwner, repo);
  } else {
    installationId = await getInstallationId(appOctokit, owner);
  }

  const { appId, privateKey } = credential;
  const authOptions: { appId: number; privateKey: string; installationId: number; request?: typeof request } = {
    appId,
    privateKey,
    installationId,
  };
  if (ghesApiUrl) {
    authOptions.request = request.defaults({ baseUrl: ghesApiUrl });
  }
  const auth = createAppAuth(authOptions);
  const installationAuth = await auth({ type: 'installation' });
  return createOctokitInstance(installationAuth.token, ghesApiUrl, appId, owner);
}

export async function createRunnerInstallationClient(
  owner: string,
  runnerType: string,
  ghesApiUrl: string,
): Promise<Octokit> {
  const remaining = [...(await getAppCredentials())];
  while (remaining.length) {
    const credential = selectCredential(remaining, owner, ghesApiUrl);
    remaining.splice(remaining.indexOf(credential), 1);
    try {
      const appClient = await createAuthenticatedClient(ghesApiUrl, credential);
      return await createInstallationClient(appClient, owner, runnerType, ghesApiUrl, credential);
    } catch (error) {
      coolDown(budgetKey(credential.appId, ghesApiUrl, owner));
      if (!remaining.length) throw error;
      logger.warn('GitHub App authentication failed; trying another configured app', { appId: credential.appId });
    }
  }
  throw new Error('No GitHub App credentials found');
}
