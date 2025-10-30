import { Octokit } from '@octokit/rest';
import { addPersistentContextToChildLogger, createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { getParameter, putParameter } from '@aws-github-runner/aws-ssm-util';
import yn from 'yn';

import { createGithubAppAuth, createGithubInstallationAuth, createOctokitClient } from '../github/auth';
import { createRunner, listEC2Runners, tag } from './../aws/runners';
import { RunnerInputParameters } from './../aws/runners.d';
import { metricGitHubAppRateLimit } from '../github/rate-limit';

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
  repoOwnerType: string;
  retryCounter?: number;
}

export interface ActionRequestMessageSQS extends ActionRequestMessage {
  messageId: string;
}

export interface ActionRequestMessageRetry extends ActionRequestMessage {
  retryCounter: number;
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
  tracingEnabled?: boolean;
  onDemandFailoverOnError?: string[];
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

  const appId = parseInt(await getParameter(process.env.PARAMETER_GITHUB_APP_ID_NAME));
  logger.info('App id from SSM', { appId: appId });
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

export async function getInstallationId(
  githubAppClient: Octokit,
  enableOrgLevel: boolean,
  payload: ActionRequestMessage,
): Promise<number> {
  if (payload.installationId !== 0) {
    return payload.installationId;
  }

  return enableOrgLevel
    ? (
        await githubAppClient.apps.getOrgInstallation({
          org: payload.repositoryOwner,
        })
      ).data.id
    : (
        await githubAppClient.apps.getRepoInstallation({
          owner: payload.repositoryOwner,
          repo: payload.repositoryName,
        })
      ).data.id;
}

export async function isJobQueued(githubInstallationClient: Octokit, payload: ActionRequestMessage): Promise<boolean> {
  let isQueued = false;
  if (payload.eventType === 'workflow_job') {
    const jobForWorkflowRun = await githubInstallationClient.actions.getJobForWorkflowRun({
      job_id: payload.id,
      owner: payload.repositoryOwner,
      repo: payload.repositoryName,
    });
    metricGitHubAppRateLimit(jobForWorkflowRun.headers);
    isQueued = jobForWorkflowRun.data.status === 'queued';
    logger.debug(`The job ${payload.id} is${isQueued ? ' ' : 'not'} queued`);
  } else {
    throw Error(`Event ${payload.eventType} is not supported`);
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
      runnerGroupId = await getRunnerGroupByName(ghClient, githubRunnerConfig);
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

async function getRunnerGroupByName(ghClient: Octokit, githubRunnerConfig: CreateGitHubRunnerConfig): Promise<number> {
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
  numberOfRunners: number,
  ghClient: Octokit,
): Promise<string[]> {
  const instances = await createRunner({
    runnerType: githubRunnerConfig.runnerType,
    runnerOwner: githubRunnerConfig.runnerOwner,
    numberOfRunners,
    ...ec2RunnerConfig,
  });
  if (instances.length !== 0) {
    await createStartRunnerConfig(githubRunnerConfig, instances, ghClient);
  }

  return instances;
}

export async function scaleUp(payloads: ActionRequestMessageSQS[]): Promise<string[]> {
  logger.info('Received scale up requests', {
    n_requests: payloads.length,
  });

  const enableOrgLevel = yn(process.env.ENABLE_ORGANIZATION_RUNNERS, { default: true });
  const maximumRunners = parseInt(process.env.RUNNERS_MAXIMUM_COUNT || '3');
  const runnerLabels = process.env.RUNNER_LABELS || '';
  const runnerGroup = process.env.RUNNER_GROUP_NAME || 'Default';
  const environment = process.env.ENVIRONMENT;
  const ssmTokenPath = process.env.SSM_TOKEN_PATH;
  const subnets = process.env.SUBNET_IDS.split(',');
  const instanceTypes = process.env.INSTANCE_TYPES.split(',');
  const instanceTargetCapacityType = process.env.INSTANCE_TARGET_CAPACITY_TYPE;
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
  const tracingEnabled = yn(process.env.POWERTOOLS_TRACE_ENABLED, { default: false });
  const onDemandFailoverOnError = process.env.ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS
    ? (JSON.parse(process.env.ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS) as [string])
    : [];

  const { ghesApiUrl, ghesBaseUrl } = getGitHubEnterpriseApiUrl();

  const ghAuth = await createGithubAppAuth(undefined, ghesApiUrl);
  const githubAppClient = await createOctokitClient(ghAuth.token, ghesApiUrl);

  // A map of either owner or owner/repo name to Octokit client, so we use a
  // single client per installation (set of messages), depending on how the app
  // is installed. This is for a couple of reasons:
  // - Sharing clients opens up the possibility of caching API calls.
  // - Fetching a client for an installation actually requires a couple of API
  //   calls itself, which would get expensive if done for every message in a
  //   batch.
  type MessagesWithClient = {
    messages: ActionRequestMessageSQS[];
    githubInstallationClient: Octokit;
  };

  const validMessages = new Map<string, MessagesWithClient>();
  const invalidMessages: string[] = [];
  for (const payload of payloads) {
    const { eventType, messageId, repositoryName, repositoryOwner } = payload;
    if (ephemeralEnabled && eventType !== 'workflow_job') {
      logger.warn(
        'Event is not supported in combination with ephemeral runners. Please ensure you have enabled workflow_job events.',
        { eventType, messageId },
      );

      invalidMessages.push(messageId);

      continue;
    }

    if (!isValidRepoOwnerTypeIfOrgLevelEnabled(payload, enableOrgLevel)) {
      logger.warn(
        `Repository does not belong to a GitHub organization and organization runners are enabled. This is not supported. Not scaling up for this event. Not throwing error to prevent re-queueing and just ignoring the event.`,
        {
          repository: `${repositoryOwner}/${repositoryName}`,
          messageId,
        },
      );

      continue;
    }

    const key = enableOrgLevel ? payload.repositoryOwner : `${payload.repositoryOwner}/${payload.repositoryName}`;

    let entry = validMessages.get(key);

    // If we've not seen this owner/repo before, we'll need to create a GitHub
    // client for it.
    if (entry === undefined) {
      const installationId = await getInstallationId(githubAppClient, enableOrgLevel, payload);
      const ghAuth = await createGithubInstallationAuth(installationId, ghesApiUrl);
      const githubInstallationClient = await createOctokitClient(ghAuth.token, ghesApiUrl);

      entry = {
        messages: [],
        githubInstallationClient,
      };

      validMessages.set(key, entry);
    }

    entry.messages.push(payload);
  }

  const runnerType = enableOrgLevel ? 'Org' : 'Repo';

  addPersistentContextToChildLogger({
    runner: {
      ephemeral: ephemeralEnabled,
      type: runnerType,
      namePrefix: runnerNamePrefix,
      n_events: Array.from(validMessages.values()).reduce((acc, group) => acc + group.messages.length, 0),
    },
  });

  logger.info(`Received events`);

  for (const [group, { githubInstallationClient, messages }] of validMessages.entries()) {
    // Work out how much we want to scale up by.
    let scaleUp = 0;

    for (const message of messages) {
      const messageLogger = logger.createChild({
        persistentKeys: {
          eventType: message.eventType,
          group,
          messageId: message.messageId,
          repository: `${message.repositoryOwner}/${message.repositoryName}`,
        },
      });

      if (enableJobQueuedCheck && !(await isJobQueued(githubInstallationClient, message))) {
        messageLogger.info('No runner will be created, job is not queued.');

        continue;
      }

      scaleUp++;
    }

    if (scaleUp === 0) {
      logger.info('No runners will be created for this group, no valid messages found.');

      continue;
    }

    // Don't call the EC2 API if we can create an unlimited number of runners.
    const currentRunners =
      maximumRunners === -1 ? 0 : (await listEC2Runners({ environment, runnerType, runnerOwner: group })).length;

    logger.info('Current runners', {
      currentRunners,
      maximumRunners,
    });

    // Calculate how many runners we want to create.
    const newRunners =
      maximumRunners === -1
        ? // If we don't have an upper limit, scale up by the number of new jobs.
          scaleUp
        : // Otherwise, we do have a limit, so work out if `scaleUp` would exceed it.
          Math.min(scaleUp, maximumRunners - currentRunners);

    const missingInstanceCount = Math.max(0, scaleUp - newRunners);

    if (missingInstanceCount > 0) {
      logger.info('Not all runners will be created for this group, maximum number of runners reached.', {
        desiredNewRunners: scaleUp,
      });

      if (ephemeralEnabled) {
        // This removes `missingInstanceCount` items from the start of the array
        // so that, if we retry more messages later, we pick fresh ones.
        invalidMessages.push(...messages.splice(0, missingInstanceCount).map(({ messageId }) => messageId));
      }

      // No runners will be created, so skip calling the EC2 API.
      if (missingInstanceCount === scaleUp) {
        continue;
      }
    }

    logger.info(`Attempting to launch new runners`, {
      newRunners,
    });

    const instances = await createRunners(
      {
        ephemeral: ephemeralEnabled,
        enableJitConfig,
        ghesBaseUrl,
        runnerLabels,
        runnerGroup,
        runnerNamePrefix,
        runnerOwner: group,
        runnerType,
        disableAutoUpdate,
        ssmTokenPath,
        ssmConfigPath,
      },
      {
        ec2instanceCriteria: {
          instanceTypes,
          targetCapacityType: instanceTargetCapacityType,
          maxSpotPrice: instanceMaxSpotPrice,
          instanceAllocationStrategy: instanceAllocationStrategy,
        },
        environment,
        launchTemplateName,
        subnets,
        amiIdSsmParameterName,
        tracingEnabled,
        onDemandFailoverOnError,
      },
      newRunners,
      githubInstallationClient,
    );

    // Not all runners we wanted were created, let's reject enough items so that
    // number of entries will be retried.
    if (instances.length !== newRunners) {
      const failedInstanceCount = newRunners - instances.length;

      logger.warn('Some runners failed to be created, rejecting some messages so the requests are retried', {
        wanted: newRunners,
        got: instances.length,
        failedInstanceCount,
      });

      invalidMessages.push(...messages.slice(0, failedInstanceCount).map(({ messageId }) => messageId));
    }
  }

  return invalidMessages;
}

export function getGitHubEnterpriseApiUrl() {
  const ghesBaseUrl = process.env.GHES_URL;
  let ghesApiUrl = '';
  if (ghesBaseUrl) {
    const url = new URL(ghesBaseUrl);
    const domain = url.hostname;
    if (domain.endsWith('.ghe.com')) {
      // Data residency: Prepend 'api.'
      ghesApiUrl = `https://api.${domain}`;
    } else {
      // GitHub Enterprise Server: Append '/api/v3'
      ghesApiUrl = `${ghesBaseUrl}/api/v3`;
    }
  }
  logger.debug(`Github Enterprise URLs: api_url - ${ghesApiUrl}; base_url - ${ghesBaseUrl}`);
  return { ghesApiUrl, ghesBaseUrl };
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

function isValidRepoOwnerTypeIfOrgLevelEnabled(payload: ActionRequestMessage, enableOrgLevel: boolean): boolean {
  return !(enableOrgLevel && payload.repoOwnerType !== 'Organization');
}

function addDelay(instances: string[]) {
  const delay = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const ssmParameterStoreMaxThroughput = 40;
  const isDelay = instances.length >= ssmParameterStoreMaxThroughput;
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
    await putParameter(`${githubRunnerConfig.ssmTokenPath}/${instance}`, runnerServiceConfig.join(' '), true, {
      tags: [{ Key: 'InstanceId', Value: instance }],
    });
    if (isDelay) {
      // Delay to prevent AWS ssm rate limits by being within the max throughput limit
      await delay(25);
    }
  }
}

async function tagRunnerId(instanceId: string, runnerId: string): Promise<void> {
  try {
    await tag(instanceId, [{ Key: 'ghr:github_runner_id', Value: runnerId }]);
  } catch (e) {
    logger.error(`Failed to mark runner '${instanceId}' with ${runnerId}.`, { error: e });
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

    metricGitHubAppRateLimit(runnerConfig.headers);

    // tag the EC2 instance with the Github runner id
    await tagRunnerId(instance, runnerConfig.data.runner.id.toString());

    // store jit config in ssm parameter store
    logger.debug('Runner JIT config for ephemeral runner generated.', {
      instance: instance,
    });
    await putParameter(`${githubRunnerConfig.ssmTokenPath}/${instance}`, runnerConfig.data.encoded_jit_config, true, {
      tags: [{ Key: 'InstanceId', Value: instance }],
    });
    if (isDelay) {
      // Delay to prevent AWS ssm rate limits by being within the max throughput limit
      await delay(25);
    }
  }
}
