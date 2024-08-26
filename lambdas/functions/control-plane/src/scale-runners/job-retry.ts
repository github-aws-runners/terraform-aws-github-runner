import {
  addPersistentContextToChildLogger,
  createSingleMetric,
  logger,
} from '@terraform-aws-github-runner/aws-powertools-util';
import { publishMessage } from '../aws/sqs';
import { ActionRequestMessage, ActionRequestMessageRetry, getGitHubEnterpriseApiUrl, isJobQueued } from './scale-up';
import { getOctokit } from '../github/octokit';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import yn from 'yn';

interface JobRetryConfig {
  enable: boolean;
  maxAttempts: number;
  delayInSeconds: number;
  delayBackoff: number;
  queueUrl: string;
}

export async function publishRetryMessage(payload: ActionRequestMessage): Promise<void> {
  if (process.env.JOB_RETRY_CONFIG === undefined) {
    logger.debug('Job retry config not found, skipping retry');
    return;
  }

  const jobRetryConfig = JSON.parse(process.env.JOB_RETRY_CONFIG) as JobRetryConfig;
  payload.retryCounter = payload.retryCounter != undefined ? payload.retryCounter + 1 : 0;

  if (jobRetryConfig.enable && payload.retryCounter < jobRetryConfig.maxAttempts) {
    logger.debug(`Job retry is enabled and retry counter is below max attempts, publishing message for retry`, {
      message: payload,
      config: jobRetryConfig,
    });
    let delay = jobRetryConfig.delayInSeconds * Math.pow(jobRetryConfig.delayBackoff, payload.retryCounter);
    delay = Math.min(delay, 900); // max delay of 15 minutes
    await publishMessage(JSON.stringify(payload), jobRetryConfig.queueUrl, delay);
    logger.info(`Messages published for retry check with a delay of: '${delay}' seconds`);
  } else {
    logger.debug(`Job retry is disabled or max attempts reached, skipping retry`, { payload });
  }
}

export async function checkAndRetryJob(payload: ActionRequestMessageRetry): Promise<void> {
  const enableOrgLevel = yn(process.env.ENABLE_ORGANIZATION_RUNNERS, { default: true });
  const runnerType = enableOrgLevel ? 'Org' : 'Repo';
  const runnerOwner = enableOrgLevel ? payload.repositoryOwner : `${payload.repositoryOwner}/${payload.repositoryName}`;
  const runnerNamePrefix = process.env.RUNNER_NAME_PREFIX ?? '';
  const jobQueueUrl = process.env.JOB_QUEUE_SCALE_UP_URL ?? '';
  const enableMetrics = yn(process.env.ENABLE_METRIC_JOB_RETRY, { default: false });
  const environment = process.env.ENVIRONMENT;

  addPersistentContextToChildLogger({
    runner: {
      type: runnerType,
      owner: runnerOwner,
      namePrefix: runnerNamePrefix,
    },
    github: {
      event: payload.eventType,
      workflow_job_id: payload.id.toString(),
    },
  });

  logger.info(`Received event`);

  const { ghesApiUrl } = getGitHubEnterpriseApiUrl();
  const ghClient = await getOctokit(ghesApiUrl, enableOrgLevel, payload);

  // check job is still queued
  if (await isJobQueued(ghClient, payload)) {
    await publishMessage(JSON.stringify(payload), jobQueueUrl);
    createMetric(enableMetrics, environment, payload);
    logger.info(`Job is still queued, message published to build queue and will be handled by scale-up.`, { payload });
  } else {
    logger.debug(`Job is no longer queued, skipping retry`, { payload });
  }
}

function createMetric(enableMetrics: boolean, environment: string, payload: ActionRequestMessageRetry) {
  if (enableMetrics) {
    const metric = createSingleMetric('RetryJob', MetricUnit.Count, 1, {
      Environment: environment,
      RetryCount: payload.retryCounter?.toString(),
    });
    metric.addMetadata('Environment', environment);
    metric.addMetadata('RepositoryName', payload.repositoryName);
    metric.addMetadata('RepositoryOwner', payload.repositoryOwner);
    metric.addMetadata('RetryCounter', payload.retryCounter?.toString());
  }
}
