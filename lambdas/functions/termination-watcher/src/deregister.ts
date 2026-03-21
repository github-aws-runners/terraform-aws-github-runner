import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import { request } from '@octokit/request';
import { Instance } from '@aws-sdk/client-ec2';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { getParameter } from '@aws-github-runner/aws-ssm-util';
import type { EndpointDefaults } from '@octokit/types';
import type { Config } from './ConfigResolver';

const logger = createChildLogger('deregister');

export function createThrottleOptions() {
  return {
    onRateLimit: (_retryAfter: number, options: Required<EndpointDefaults>) => {
      logger.warn(`Rate limit hit for ${options.method} ${options.url}`);
      return false;
    },
    onSecondaryRateLimit: (_retryAfter: number, options: Required<EndpointDefaults>) => {
      logger.warn(`Secondary rate limit hit for ${options.method} ${options.url}`);
      return false;
    },
  };
}

async function getAppCredentials(): Promise<{ appId: number; privateKey: string }> {
  const appId = parseInt(await getParameter(process.env.PARAMETER_GITHUB_APP_ID_NAME!));
  const privateKey = Buffer.from(await getParameter(process.env.PARAMETER_GITHUB_APP_KEY_BASE64_NAME!), 'base64')
    .toString()
    .replace('/[\\n]/g', String.fromCharCode(10));
  return { appId, privateKey };
}

function createOctokitInstance(token: string, ghesApiUrl: string): Octokit {
  const CustomOctokit = Octokit.plugin(throttling);
  const octokitOptions: ConstructorParameters<typeof Octokit>[0] = {
    auth: token,
  };
  if (ghesApiUrl) {
    octokitOptions.baseUrl = ghesApiUrl;
  }
  return new CustomOctokit({
    ...octokitOptions,
    userAgent: 'github-aws-runners-termination-watcher',
    throttle: createThrottleOptions(),
  });
}

async function createAuthenticatedClient(ghesApiUrl: string): Promise<Octokit> {
  const { appId, privateKey } = await getAppCredentials();
  const authOptions: { appId: number; privateKey: string; request?: typeof request } = {
    appId,
    privateKey,
  };
  if (ghesApiUrl) {
    authOptions.request = request.defaults({ baseUrl: ghesApiUrl });
  }
  // @ts-ignore - Type mismatch between @octokit/request and @octokit/auth-app versions
  const auth = createAppAuth(authOptions);
  const appAuth = await auth({ type: 'app' });
  return createOctokitInstance(appAuth.token, ghesApiUrl);
}

function getOwnerFromTags(instance: Instance): string | undefined {
  return instance.Tags?.find((tag) => tag.Key === 'ghr:Owner')?.Value;
}

function getRunnerTypeFromTags(instance: Instance): string | undefined {
  return instance.Tags?.find((tag) => tag.Key === 'ghr:Type')?.Value;
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
): Promise<Octokit> {
  let installationId: number;
  if (runnerType === 'Repo') {
    const [repoOwner, repo] = owner.split('/');
    installationId = await getInstallationIdForRepo(appOctokit, repoOwner, repo);
  } else {
    installationId = await getInstallationId(appOctokit, owner);
  }

  const { appId, privateKey } = await getAppCredentials();
  const authOptions: { appId: number; privateKey: string; installationId: number; request?: typeof request } = {
    appId,
    privateKey,
    installationId,
  };
  if (ghesApiUrl) {
    authOptions.request = request.defaults({ baseUrl: ghesApiUrl });
  }
  // @ts-ignore - Type mismatch between @octokit/request and @octokit/auth-app versions
  const auth = createAppAuth(authOptions);
  const installationAuth = await auth({ type: 'installation' });
  return createOctokitInstance(installationAuth.token, ghesApiUrl);
}

async function findRunnerByInstanceId(
  octokit: Octokit,
  owner: string,
  instanceId: string,
  runnerType: string,
): Promise<{ id: number; name: string } | undefined> {
  if (runnerType === 'Repo') {
    const [repoOwner, repo] = owner.split('/');
    for await (const response of octokit.paginate.iterator(octokit.actions.listSelfHostedRunnersForRepo, {
      owner: repoOwner,
      repo,
      per_page: 100,
    })) {
      const runner = response.data.find((r) => r.name.includes(instanceId));
      if (runner) {
        return { id: runner.id, name: runner.name };
      }
    }
  } else {
    for await (const response of octokit.paginate.iterator(octokit.actions.listSelfHostedRunnersForOrg, {
      org: owner,
      per_page: 100,
    })) {
      const runner = response.data.find((r) => r.name.includes(instanceId));
      if (runner) {
        return { id: runner.id, name: runner.name };
      }
    }
  }

  return undefined;
}

async function deleteRunner(octokit: Octokit, owner: string, runnerId: number, runnerType: string): Promise<void> {
  if (runnerType === 'Repo') {
    const [repoOwner, repo] = owner.split('/');
    await octokit.actions.deleteSelfHostedRunnerFromRepo({
      owner: repoOwner,
      repo,
      runner_id: runnerId,
    });
  } else {
    await octokit.actions.deleteSelfHostedRunnerFromOrg({
      org: owner,
      runner_id: runnerId,
    });
  }
}

export async function deregisterRunner(instance: Instance, config: Config): Promise<void> {
  if (!config.enableRunnerDeregistration) {
    logger.debug('Runner deregistration is disabled, skipping');
    return;
  }

  const instanceId = instance.InstanceId;
  if (!instanceId) {
    logger.warn('Instance ID is missing, cannot deregister runner');
    return;
  }

  const owner = getOwnerFromTags(instance);
  const runnerType = getRunnerTypeFromTags(instance) ?? 'Org';

  if (!owner) {
    logger.warn('ghr:Owner tag not found on instance, cannot deregister runner', { instanceId });
    return;
  }

  try {
    logger.info('Attempting to deregister runner from GitHub', { instanceId, owner, runnerType });

    const appOctokit = await createAuthenticatedClient(config.ghesApiUrl);
    const installationOctokit = await createInstallationClient(appOctokit, owner, runnerType, config.ghesApiUrl);

    const runner = await findRunnerByInstanceId(installationOctokit, owner, instanceId, runnerType);
    if (!runner) {
      logger.info('Runner not found in GitHub, may have already been deregistered', { instanceId, owner });
      return;
    }

    await deleteRunner(installationOctokit, owner, runner.id, runnerType);
    logger.info('Successfully deregistered runner from GitHub', {
      instanceId,
      runnerId: runner.id,
      runnerName: runner.name,
      owner,
    });
  } catch (error) {
    // GitHub returns 422 when a runner is currently executing a job.
    // The runner will become offline after the instance terminates, and the
    // scale-down Lambda's reconciliation loop will clean it up on its next cycle.
    const isRunnerBusy = error instanceof Error && 'status' in error && (error as { status: number }).status === 422;
    if (isRunnerBusy) {
      logger.warn('Runner is currently busy, cannot deregister now. Scale-down reconciliation will clean it up.', {
        instanceId,
        owner,
      });
    } else {
      logger.error('Failed to deregister runner from GitHub', {
        instanceId,
        owner,
        error: error as Error,
      });
    }
  }
}
