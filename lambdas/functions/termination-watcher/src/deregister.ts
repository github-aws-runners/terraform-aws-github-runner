import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import { request } from '@octokit/request';
import { Instance } from '@aws-sdk/client-ec2';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { getParameter } from '@aws-github-runner/aws-ssm-util';
import type { EndpointDefaults } from '@octokit/types';
import type { Config } from './ConfigResolver';

export interface DeregisterRetryMessage {
  instanceId: string;
  owner: string;
  runnerType: string;
  runnerId: number;
  retryCount: number;
}

const sqsClient = new SQSClient({ region: process.env.AWS_REGION });

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
    // Queue a delayed retry — the instance will be terminated by EC2 shortly,
    // and the runner will appear offline when we retry in 5 minutes.
    const isRunnerBusy = error instanceof Error && 'status' in error && (error as { status: number }).status === 422;
    if (isRunnerBusy) {
      const queueUrl = process.env.DEREGISTER_RETRY_QUEUE_URL;
      if (queueUrl) {
        await queueDeregisterRetry(queueUrl, { instanceId, owner, runnerType, runnerId: 0, retryCount: 0 });
        logger.warn('Runner is busy — queued deregistration retry in 5 minutes via SQS', { instanceId, owner });
      } else {
        logger.warn('Runner is busy and DEREGISTER_RETRY_QUEUE_URL is not set — deregistration skipped', {
          instanceId,
          owner,
        });
      }
    } else {
      logger.error('Failed to deregister runner from GitHub', {
        instanceId,
        owner,
        error: error as Error,
      });
    }
  }
}

async function queueDeregisterRetry(queueUrl: string, message: DeregisterRetryMessage): Promise<void> {
  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(message),
  });
  await sqsClient.send(command);
}

export async function handleDeregisterRetry(queueUrl: string, message: DeregisterRetryMessage): Promise<void> {
  const { instanceId, owner, runnerType, retryCount } = message;
  logger.info('Processing deregistration retry from SQS', { instanceId, owner, runnerType, retryCount });

  try {
    const appOctokit = await createAuthenticatedClient('');
    const installationOctokit = await createInstallationClient(appOctokit, owner, runnerType, '');

    const runner = await findRunnerByInstanceId(installationOctokit, owner, instanceId, runnerType);
    if (!runner) {
      logger.info('Runner not found in GitHub — already deregistered or never registered', { instanceId, owner });
      return;
    }

    await deleteRunner(installationOctokit, owner, runner.id, runnerType);
    logger.info('Successfully deregistered runner via SQS retry', {
      instanceId,
      runnerId: runner.id,
      runnerName: runner.name,
      owner,
      retryCount,
    });
  } catch (error) {
    const isRunnerBusy = error instanceof Error && 'status' in error && (error as { status: number }).status === 422;
    if (isRunnerBusy) {
      // Re-enqueue for another retry — SQS maxReceiveCount DLQ will stop after 3 total attempts.
      // Re-send explicitly so each retry resets the delay (SQS visibility timeout applies on re-receive,
      // but re-sending gives us the full 5-minute DelaySeconds again).
      await queueDeregisterRetry(queueUrl, { ...message, retryCount: retryCount + 1 });
      logger.warn('Runner still busy on retry — re-queued for another attempt', {
        instanceId,
        owner,
        retryCount: retryCount + 1,
      });
    } else {
      logger.error('Failed to deregister runner on retry', {
        instanceId,
        owner,
        retryCount,
        error: error as Error,
      });
      // Re-throw so SQS treats this as a failure and routes to DLQ after maxReceiveCount
      throw error;
    }
  }
}
