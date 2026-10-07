import type { Octokit } from '@octokit/rest';
import { Instance } from '@aws-sdk/client-ec2';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import type { Config } from './ConfigResolver';
import { createRunnerInstallationClient } from './github-app-client';
export { createThrottleOptions, resetAppCredentialsCache } from './github-app-client';

export interface DeregisterRetryMessage {
  instanceId: string;
  owner: string;
  runnerType: string;
  runnerId: number;
  retryCount: number;
}

const sqsClient = new SQSClient({ region: process.env.AWS_REGION });

const logger = createChildLogger('deregister');

function getOwnerFromTags(instance: Instance): string | undefined {
  return instance.Tags?.find((tag) => tag.Key === 'ghr:Owner')?.Value;
}

function getRunnerTypeFromTags(instance: Instance): string | undefined {
  return instance.Tags?.find((tag) => tag.Key === 'ghr:Type')?.Value;
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

    const installationOctokit = await createRunnerInstallationClient(owner, runnerType, config.ghesApiUrl);

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
    const installationOctokit = await createRunnerInstallationClient(owner, runnerType, process.env.GHES_URL ?? '');

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
