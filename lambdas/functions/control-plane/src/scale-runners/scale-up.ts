import { Octokit } from '@octokit/rest';
import { addPersistentContextToChildLogger, createChildLogger } from '@terraform-aws-github-runner/aws-powertools-util';
import { getParameter, putParameter } from '@terraform-aws-github-runner/aws-ssm-util';
import yn from 'yn';

import { createGithubAppAuth, createGithubInstallationAuth, createOctoClient } from '../gh-auth/gh-auth';
import { createRunner, listEC2Runners } from './../aws/runners';
import { RunnerInputParameters } from './../aws/runners.d';
import ScaleError from './ScaleError';

const logger = createChildLogger('scale-up');

export interface RunnerGroup {
  name: string;
  id: number;
}

interface EphemeralRunnerConfig {
  runnerName: string;
  runnerGroupId: number;
  runnerLabels: string[];
}

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
  enableJitConfig: boolean;
  runnerLabels: string;
  runnerGroup: string;
  runnerNamePrefix: string;
  runnerOwner: string;
  runnerType: 'Org' | 'Repo';
  disableAutoUpdate: boolean;
  ssmTokenPath: string;
  ssmConfigPath: string;
}

interface CreateEC2RunnerConfig {
  environment: string;
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

  if (githubRunnerConfig.runnerLabels) {
    config.push(`--labels ${githubRunnerConfig.runnerLabels}`.trim());
  }

  if (githubRunnerConfig.disableAutoUpdate) {
    config.push('--disableupdate');
  }

  if (githubRunnerConfig.runnerType === 'Org' && githubRunnerConfig.runnerGroup !== undefined) {
    config.push(`--runnergroup ${githubRunnerConfig.runnerGroup}`);
  }

  if (githubRunnerConfig.ephemeral) {
    config.push(`--ephemeral`);
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

function removeTokenFromLogging(config: string[]): string[] {
  const result: string[] = [];
  config.forEach((e) => {
    if (e.startsWith('--token')) {
      result.push('--token <REDACTED>');
    } else {
      result.push(e);
    }
  });
  return result;
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

async function getRunnerGroupId(githubRunnerConfig: CreateGitHubRunnerConfig, ghClient: Octokit): Promise<number> {
  // if the runnerType is Repo, then runnerGroupId is default to 1
  let runnerGroupId: number | undefined = 1;
  if (githubRunnerConfig.runnerType === 'Org' && githubRunnerConfig.runnerGroup !== undefined) {
    let runnerGroup: string | undefined;
    // check if runner group id is already stored in SSM Parameter Store and
    // use it if it exists to avoid API call to GitHub
    try {
      runnerGroup = await getParameter(
        `${githubRunnerConfig.ssmConfigPath}/runner-group/${githubRunnerConfig.runnerGroup}`,
      );
    } catch (err) {
      logger.debug('Handling error:', err as Error);
      logger.warn(
        `SSM Parameter "${githubRunnerConfig.ssmConfigPath}/runner-group/${githubRunnerConfig.runnerGroup}"
         for Runner group ${githubRunnerConfig.runnerGroup} does not exist`,
      );
    }
    if (runnerGroup === undefined) {
      // get runner group id from GitHub
      runnerGroupId = await GetRunnerGroupByName(ghClient, githubRunnerConfig);
      // store runner group id in SSM
      try {
        await putParameter(
          `${githubRunnerConfig.ssmConfigPath}/runner-group/${githubRunnerConfig.runnerGroup}`,
          runnerGroupId.toString(),
          false,
        );
      } catch (err) {
        logger.debug('Error storing runner group id in SSM Parameter Store', err as Error);
        throw err;
      }
    } else {
      runnerGroupId = parseInt(runnerGroup);
    }
  }
  return runnerGroupId;
}

async function GetRunnerGroupByName(ghClient: Octokit, githubRunnerConfig: CreateGitHubRunnerConfig): Promise<number> {
  const runnerGroups: RunnerGroup[] = await ghClient.paginate(`GET /orgs/{org}/actions/runner-groups`, {
    org: githubRunnerConfig.runnerOwner,
    per_page: 100,
  });
  const runnerGroupId = runnerGroups.find((runnerGroup) => runnerGroup.name === githubRunnerConfig.runnerGroup)?.id;

  if (runnerGroupId === undefined) {
    throw new Error(`Runner group ${githubRunnerConfig.runnerGroup} does not exist`);
  }

  return runnerGroupId;
}

export async function createRunners(
  githubRunnerConfig: CreateGitHubRunnerConfig,
  ec2RunnerConfig: CreateEC2RunnerConfig,
  ghClient: Octokit,
): Promise<void> {
  const instances = await createRunner({
    runnerType: githubRunnerConfig.runnerType,
    runnerOwner: githubRunnerConfig.runnerOwner,
    ...ec2RunnerConfig,
  });
  if (instances.length !== 0) {
    await createStartRunnerConfig(githubRunnerConfig, instances, ghClient);
  }
}

export async function scaleUp(eventSource: string, payload: ActionRequestMessage): Promise<void> {
  logger.info(`Received ${payload.eventType} from ${payload.repositoryOwner}/${payload.repositoryName}`);

  if (eventSource !== 'aws:sqs') throw Error('Cannot handle non-SQS events!');
  const enableOrgLevel = yn(process.env.ENABLE_ORGANIZATION_RUNNERS, { default: true });
  const maximumRunners = parseInt(process.env.RUNNERS_MAXIMUM_COUNT || '3');
  const runnerLabels = process.env.RUNNER_LABELS || '';
  const runnerGroup = process.env.RUNNER_GROUP_NAME || 'Default';
  const environment = process.env.ENVIRONMENT;
  const ghesBaseUrl = process.env.GHES_URL;
  const ssmTokenPath = process.env.SSM_TOKEN_PATH;
  const subnets = process.env.SUBNET_IDS.split(',');
  const instanceTypes = process.env.INSTANCE_TYPES.split(',');
  const instanceTargetTargetCapacityType = process.env.INSTANCE_TARGET_CAPACITY_TYPE;
  const ephemeralEnabled = yn(process.env.ENABLE_EPHEMERAL_RUNNERS, { default: false });
  const enableJitConfig = yn(process.env.ENABLE_JIT_CONFIG, { default: ephemeralEnabled });
  const disableAutoUpdate = yn(process.env.DISABLE_RUNNER_AUTOUPDATE, { default: false });
  const launchTemplateName = process.env.LAUNCH_TEMPLATE_NAME;
  const instanceMaxSpotPrice = process.env.INSTANCE_MAX_SPOT_PRICE;
  const instanceAllocationStrategy = process.env.INSTANCE_ALLOCATION_STRATEGY || 'lowest-price'; // same as AWS default
  const enableJobQueuedCheck = yn(process.env.ENABLE_JOB_QUEUED_CHECK, { default: true });
  const amiIdSsmParameterName = process.env.AMI_ID_SSM_PARAMETER_NAME;
  const runnerNamePrefix = process.env.RUNNER_NAME_PREFIX || '';
  const ssmConfigPath = process.env.SSM_CONFIG_PATH || '';

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
          enableJitConfig,
          ghesBaseUrl,
          runnerLabels,
          runnerGroup,
          runnerNamePrefix,
          runnerOwner,
          runnerType,
          disableAutoUpdate,
          ssmTokenPath,
          ssmConfigPath,
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
async function createStartRunnerConfig(
  githubRunnerConfig: CreateGitHubRunnerConfig,
  instances: string[],
  ghClient: Octokit,
) {
  if (githubRunnerConfig.enableJitConfig && githubRunnerConfig.ephemeral) {
    await createJitConfig(githubRunnerConfig, instances, ghClient);
  } else {
    await createRegistrationTokenConfig(githubRunnerConfig, instances, ghClient);
  }
}

function addDelay(instances: string[]) {
  const delay = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const ssmParameterStoreMaxThroughput = 40;
  const isDelay = instances.length >= ssmParameterStoreMaxThroughput ? true : false;
  return { isDelay, delay };
}

async function createRegistrationTokenConfig(
  githubRunnerConfig: CreateGitHubRunnerConfig,
  instances: string[],
  ghClient: Octokit,
) {
  const { isDelay, delay } = addDelay(instances);
  const token = await getGithubRunnerRegistrationToken(githubRunnerConfig, ghClient);
  const runnerServiceConfig = generateRunnerServiceConfig(githubRunnerConfig, token);

  logger.debug('Runner service config for non-ephemeral runners', {
    runner_service_config: removeTokenFromLogging(runnerServiceConfig),
  });

  for (const instance of instances) {
    await putParameter(`${githubRunnerConfig.ssmTokenPath}/${instance}`, runnerServiceConfig.join(' '), true);
    if (isDelay) {
      // Delay to prevent AWS ssm rate limits by being within the max throughput limit
      await delay(25);
    }
  }
}

async function createJitConfig(githubRunnerConfig: CreateGitHubRunnerConfig, instances: string[], ghClient: Octokit) {
  const runnerGroupId = await getRunnerGroupId(githubRunnerConfig, ghClient);
  const { isDelay, delay } = addDelay(instances);
  const runnerLabels = githubRunnerConfig.runnerLabels.split(',');

  logger.debug(`Runner group id: ${runnerGroupId}`);
  logger.debug(`Runner labels: ${runnerLabels}`);
  for (const instance of instances) {
    // generate jit config for runner registration
    const ephemeralRunnerConfig: EphemeralRunnerConfig = {
      runnerName: `${githubRunnerConfig.runnerNamePrefix}${instance}`,
      runnerGroupId: runnerGroupId,
      runnerLabels: runnerLabels,
    };
    logger.debug(`Runner name: ${ephemeralRunnerConfig.runnerName}`);
    const runnerConfig =
      githubRunnerConfig.runnerType === 'Org'
        ? await ghClient.actions.generateRunnerJitconfigForOrg({
            org: githubRunnerConfig.runnerOwner,
            name: ephemeralRunnerConfig.runnerName,
            runner_group_id: ephemeralRunnerConfig.runnerGroupId,
            labels: ephemeralRunnerConfig.runnerLabels,
          })
        : await ghClient.actions.generateRunnerJitconfigForRepo({
            owner: githubRunnerConfig.runnerOwner.split('/')[0],
            repo: githubRunnerConfig.runnerOwner.split('/')[1],
            name: ephemeralRunnerConfig.runnerName,
            runner_group_id: ephemeralRunnerConfig.runnerGroupId,
            labels: ephemeralRunnerConfig.runnerLabels,
          });

    // store jit config in ssm parameter store
    logger.debug('Runner JIT config for ephemeral runner generated.', {
      instance: instance,
    });
    await putParameter(`${githubRunnerConfig.ssmTokenPath}/${instance}`, runnerConfig.data.encoded_jit_config, true);
    if (isDelay) {
      // Delay to prevent AWS ssm rate limits by being within the max throughput limit
      await delay(25);
    }
  }
}
