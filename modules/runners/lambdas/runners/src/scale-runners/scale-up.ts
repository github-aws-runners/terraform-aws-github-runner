import { Octokit } from '@octokit/rest';
import yn from 'yn';

import { createGithubAppAuth, createGithubInstallationAuth, createOctoClient } from '../gh-auth/gh-auth';
import { addPersistentContextToChildLogger, createChildLogger } from '../logger';
import { RunnerInputParameters, createRunner, listEC2Runners } from './../aws/runners';
import ScaleError from './ScaleError';

const logger = createChildLogger('scale-up');

export interface ActionRequestMessage {
  id: number;
  eventType: 'check_run' | 'workflow_job';
  repositoryName: string;
  repositoryOwner: string;
  installationId: number;
}

interface CreateGitHubRunnerConfig {
  ephemeral: boolean;
  ghesBaseUrl: string;
  runnerExtraLabels: string | undefined;
  runnerGroup: string | undefined;
  runnerOwner: string;
  runnerType: 'Org' | 'Repo';
  disableAutoUpdate: boolean;
}

interface CreateEC2RunnerConfig {
  environment: string;
  ssmTokenPath: string;
  subnets: string[];
  launchTemplateName: string;
  ec2instanceCriteria: RunnerInputParameters['ec2instanceCriteria'];
  numberOfRunners?: number;
  amiIdSsmParameterName?: string;
}

function generateRunnerServiceConfig(githubRunnerConfig: CreateGitHubRunnerConfig, token: string) {
  const config = [
    `--url ${githubRunnerConfig.ghesBaseUrl ?? 'https://github.com'}/${githubRunnerConfig.runnerOwner}`,
    `--token ${token}`,
  ];

  if (githubRunnerConfig.runnerExtraLabels !== undefined) {
    config.push(`--labels ${githubRunnerConfig.runnerExtraLabels}`);
  }

  if (githubRunnerConfig.ephemeral) {
    config.push(`--ephemeral`);
  }

  if (githubRunnerConfig.disableAutoUpdate) {
    config.push('--disableupdate');
  }

  if (githubRunnerConfig.runnerType === 'Org' && githubRunnerConfig.runnerGroup !== undefined) {
    config.push(`--runnergroup ${githubRunnerConfig.runnerGroup}`);
  }

  return config;
}

async function getGithubRunnerRegistrationToken(githubRunnerConfig: CreateGitHubRunnerConfig, ghClient: Octokit) {
  const registrationToken =
    githubRunnerConfig.runnerType === 'Org'
      ? await ghClient.actions.createRegistrationTokenForOrg({ org: githubRunnerConfig.runnerOwner })
      : await ghClient.actions.createRegistrationTokenForRepo({
          owner: githubRunnerConfig.runnerOwner.split('/')[0],
          repo: githubRunnerConfig.runnerOwner.split('/')[1],
        });
  return registrationToken.data.token;
}

async function getInstallationId(
  ghesApiUrl: string,
  enableOrgLevel: boolean,
  payload: ActionRequestMessage,
): Promise<number> {
  if (payload.installationId !== 0) {
    return payload.installationId;
  }

  const ghAuth = await createGithubAppAuth(undefined, ghesApiUrl);
  const githubClient = await createOctoClient(ghAuth.token, ghesApiUrl);
  return enableOrgLevel
    ? (
        await githubClient.apps.getOrgInstallation({
          org: payload.repositoryOwner,
        })
      ).data.id
    : (
        await githubClient.apps.getRepoInstallation({
          owner: payload.repositoryOwner,
          repo: payload.repositoryName,
        })
      ).data.id;
}

async function isJobQueued(githubInstallationClient: Octokit, payload: ActionRequestMessage): Promise<boolean> {
  let isQueued = false;
  if (payload.eventType === 'workflow_job') {
    const jobForWorkflowRun = await githubInstallationClient.actions.getJobForWorkflowRun({
      job_id: payload.id,
      owner: payload.repositoryOwner,
      repo: payload.repositoryName,
    });
    isQueued = jobForWorkflowRun.data.status === 'queued';
  } else {
    throw Error(`Event ${payload.eventType} is not supported`);
  }
  if (!isQueued) {
    logger.warn(`Job not queued in GitHub. A new runner instance will NOT be created for this job.`);
  }
  return isQueued;
}

export async function createRunners(
  githubRunnerConfig: CreateGitHubRunnerConfig,
  ec2RunnerConfig: CreateEC2RunnerConfig,
  ghClient: Octokit,
): Promise<void> {
  const token = await getGithubRunnerRegistrationToken(githubRunnerConfig, ghClient);

  const runnerServiceConfig = generateRunnerServiceConfig(githubRunnerConfig, token);

  await createRunner({
    runnerServiceConfig,
    runnerType: githubRunnerConfig.runnerType,
    runnerOwner: githubRunnerConfig.runnerOwner,
    ...ec2RunnerConfig,
  });
}

export async function scaleUp(eventSource: string, payload: ActionRequestMessage): Promise<void> {
  logger.info(`Received ${payload.eventType} from ${payload.repositoryOwner}/${payload.repositoryName}`);

  if (eventSource !== 'aws:sqs') throw Error('Cannot handle non-SQS events!');
  const enableOrgLevel = yn(process.env.ENABLE_ORGANIZATION_RUNNERS, { default: true });
  const maximumRunners = parseInt(process.env.RUNNERS_MAXIMUM_COUNT || '3');
  const runnerExtraLabels = process.env.RUNNER_EXTRA_LABELS;
  const runnerGroup = process.env.RUNNER_GROUP_NAME;
  const environment = process.env.ENVIRONMENT;
  const ghesBaseUrl = process.env.GHES_URL;
  const ssmTokenPath = process.env.SSM_TOKEN_PATH;
  const subnets = process.env.SUBNET_IDS.split(',');
  const instanceTypes = process.env.INSTANCE_TYPES.split(',');
  const instanceTargetTargetCapacityType = process.env.INSTANCE_TARGET_CAPACITY_TYPE;
  const ephemeralEnabled = yn(process.env.ENABLE_EPHEMERAL_RUNNERS, { default: false });
  const disableAutoUpdate = yn(process.env.DISABLE_RUNNER_AUTOUPDATE, { default: false });
  const launchTemplateName = process.env.LAUNCH_TEMPLATE_NAME;
  const instanceMaxSpotPrice = process.env.INSTANCE_MAX_SPOT_PRICE;
  const instanceAllocationStrategy = process.env.INSTANCE_ALLOCATION_STRATEGY || 'lowest-price'; // same as AWS default
  const enableJobQueuedCheck = yn(process.env.ENABLE_JOB_QUEUED_CHECK, { default: true });
  const amiIdSsmParameterName = process.env.AMI_ID_SSM_PARAMETER_NAME;

  if (ephemeralEnabled && payload.eventType !== 'workflow_job') {
    logger.warn(`${payload.eventType} event is not supported in combination with ephemeral runners.`);
    throw Error(
      `The event type ${payload.eventType} is not supported in combination with ephemeral runners.` +
        `Please ensure you have enabled workflow_job events.`,
    );
  }
  const ephemeral = ephemeralEnabled && payload.eventType === 'workflow_job';
  const runnerType = enableOrgLevel ? 'Org' : 'Repo';
  const runnerOwner = enableOrgLevel ? payload.repositoryOwner : `${payload.repositoryOwner}/${payload.repositoryName}`;

  addPersistentContextToChildLogger({
    runner: {
      type: runnerType,
      owner: runnerOwner,
    },
    github: {
      event: payload.eventType,
      workflow_job_id: payload.id.toString(),
    },
  });

  logger.info(`Received event`);

  let ghesApiUrl = '';
  if (ghesBaseUrl) {
    ghesApiUrl = `${ghesBaseUrl}/api/v3`;
  }

  const installationId = await getInstallationId(ghesApiUrl, enableOrgLevel, payload);
  const ghAuth = await createGithubInstallationAuth(installationId, ghesApiUrl);
  const githubInstallationClient = await createOctoClient(ghAuth.token, ghesApiUrl);

  if (!enableJobQueuedCheck || (await isJobQueued(githubInstallationClient, payload))) {
    const currentRunners = await listEC2Runners({
      environment,
      runnerType,
      runnerOwner,
    });
    logger.info(`Current runners: ${currentRunners.length} of ${maximumRunners}`);

    if (currentRunners.length < maximumRunners) {
      logger.info(`Attempting to launch a new runner`);

      await createRunners(
        {
          ephemeral,
          ghesBaseUrl,
          runnerExtraLabels,
          runnerGroup,
          runnerOwner,
          runnerType,
          disableAutoUpdate,
        },
        {
          ec2instanceCriteria: {
            instanceTypes,
            targetCapacityType: instanceTargetTargetCapacityType,
            maxSpotPrice: instanceMaxSpotPrice,
            instanceAllocationStrategy: instanceAllocationStrategy,
          },
          environment,
          launchTemplateName,
          ssmTokenPath,
          subnets,
          amiIdSsmParameterName,
        },
        githubInstallationClient,
      );
    } else {
      logger.info('No runner will be created, maximum number of runners reached.');
      if (ephemeral) {
        throw new ScaleError('No runners create: maximum of runners reached.');
      }
    }
  }
}
