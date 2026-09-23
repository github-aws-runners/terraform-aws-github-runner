import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import { request } from '@octokit/request';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { createCommonStorage, type GitHubAppCredential } from '@aws-github-runner/storage-providers';
import type { EndpointDefaults } from '@octokit/types';

const logger = createChildLogger('github-app-client');

let appCredentialsPromise: Promise<GitHubAppCredential[]> | undefined;

const appBudgets = new Map<number, { remaining: number; cooldownUntil: number }>();

function coolDown(appId?: number): void {
  if (appId !== undefined) appBudgets.set(appId, { remaining: 0, cooldownUntil: Date.now() + 60000 });
}

function selectCredential(credentials: GitHubAppCredential[]): GitHubAppCredential {
  const offset = Math.floor(Math.random() * credentials.length);
  const rotated = [...credentials.slice(offset), ...credentials.slice(0, offset)];
  const available = rotated.filter(
    (credential) => (appBudgets.get(credential.appId)?.cooldownUntil ?? 0) <= Date.now(),
  );
  return (available.length ? available : rotated).reduce((best, credential) =>
    (appBudgets.get(credential.appId)?.remaining ?? Infinity) > (appBudgets.get(best.appId)?.remaining ?? Infinity)
      ? credential
      : best,
  );
}

export function createThrottleOptions(appId?: number) {
  return {
    onRateLimit: (_retryAfter: number, options: Required<EndpointDefaults>) => {
      coolDown(appId);
      logger.warn(`Rate limit hit for ${options.method} ${options.url}`);
      return false;
    },
    onSecondaryRateLimit: (_retryAfter: number, options: Required<EndpointDefaults>) => {
      coolDown(appId);
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
}

function createOctokitInstance(token: string, ghesApiUrl: string, appId?: number): Octokit {
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
    throttle: createThrottleOptions(appId),
  });
  if (appId !== undefined)
    client.hook.after('request', (response) => {
      const remaining = Number.parseInt(String(response.headers['x-ratelimit-remaining']), 10);
      if (Number.isFinite(remaining))
        appBudgets.set(appId, {
          remaining,
          cooldownUntil: remaining === 0 ? Date.now() + 60000 : 0,
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
  return createOctokitInstance(installationAuth.token, ghesApiUrl, appId);
}

export async function createRunnerInstallationClient(
  owner: string,
  runnerType: string,
  ghesApiUrl: string,
): Promise<Octokit> {
  const remaining = [...(await getAppCredentials())];
  while (remaining.length) {
    const credential = selectCredential(remaining);
    remaining.splice(remaining.indexOf(credential), 1);
    try {
      const appClient = await createAuthenticatedClient(ghesApiUrl, credential);
      return await createInstallationClient(appClient, owner, runnerType, ghesApiUrl, credential);
    } catch (error) {
      coolDown(credential.appId);
      if (!remaining.length) throw error;
      logger.warn('GitHub App authentication failed; trying another configured app', { appId: credential.appId });
    }
  }
  throw new Error('No GitHub App credentials found');
}
