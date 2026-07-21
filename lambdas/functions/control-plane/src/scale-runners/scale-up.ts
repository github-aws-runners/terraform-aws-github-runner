import { Octokit } from '@octokit/rest';
import {
  addPersistentContextToChildLogger,
  createChildLogger,
  getTracedAWSV3Client,
} from '@aws-github-runner/aws-powertools-util';
import { getParameter, putParameter } from '@aws-github-runner/aws-ssm-util';
import yn from 'yn';

import { createGithubAppAuth, createGithubInstallationAuth, createOctokitClient } from '../github/auth';
import { createRunner, listEC2Runners, tag, terminateRunner } from './../aws/runners';
import { Ec2OverrideConfig, RunnerInputParameters } from './../aws/runners.d';
import { metricGitHubAppRateLimit } from '../github/rate-limit';
import { publishRetryMessage } from './job-retry';
import {
  _InstanceType,
  Tenancy,
  VolumeType,
  CpuManufacturer,
  InstanceGeneration,
  BurstablePerformance,
  BareMetal,
  AcceleratorType,
  AcceleratorManufacturer,
  AcceleratorName,
  LocalStorage,
  LocalStorageType,
  Placement,
  BaselinePerformanceFactorsRequest,
  FleetEbsBlockDeviceRequest,
  CpuPerformanceFactorRequest,
  PerformanceFactorReferenceRequest,
  FleetBlockDeviceMappingRequest,
  InstanceRequirementsRequest,
  VCpuCountRangeRequest,
  MemoryMiBRequest,
  MemoryGiBPerVCpuRequest,
  AcceleratorCountRequest,
  AcceleratorTotalMemoryMiBRequest,
  NetworkInterfaceCountRequest,
  NetworkBandwidthGbpsRequest,
  TotalLocalStorageGBRequest,
  BaselineEbsBandwidthMbpsRequest,
  DescribeLaunchTemplateVersionsCommand,
  EC2Client,
  Tag,
} from '@aws-sdk/client-ec2';

const logger = createChildLogger('scale-up');
const RUNNER_LABELS_TAG_KEY = 'ghr:runner_labels';
const RUNNER_LABELS_TAG_VALUE_SEPARATOR = ',';
const EC2_OVERRIDE_LIST_VALUE_SEPARATOR = ';';
export const EC2_TAG_VALUE_MAX_LENGTH = 256;
export const RUNNER_LABELS_TAG_MAX_COUNT = 5;

export type LambdaRunnerSource = 'scale-up-lambda' | 'pool-lambda';

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
  labels?: string[];
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
  ssmParameterStoreTags: { Key: string; Value: string }[];
}

interface CreateEC2RunnerConfig {
  environment: string;
  subnets: string[];
  launchTemplateName: string;
  ec2instanceCriteria: RunnerInputParameters['ec2instanceCriteria'];
  ec2OverrideConfig?: RunnerInputParameters['ec2OverrideConfig'];
  numberOfRunners?: number;
  amiIdSsmParameterName?: string;
  tracingEnabled?: boolean;
  onDemandFailoverOnError?: string[];
  scaleErrors: string[];
  useDedicatedHost?: boolean;
}

function generateRunnerServiceConfig(githubRunnerConfig: CreateGitHubRunnerConfig, token: string) {
  const config = [
    `--url ${githubRunnerConfig.ghesBaseUrl ?? 'https://github.com'}/${githubRunnerConfig.runnerOwner}`,
    `--token ${token}`,
  ];

  if (githubRunnerConfig.runnerLabels) {
    config.push(`--labels ${quoteRunnerLabelsForShell(githubRunnerConfig.runnerLabels)}`.trim());
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

function quoteRunnerLabelsForShell(labels: string): string {
  return /[\s;&|<>()$`"'*?[\\\]{}!]/.test(labels) ? quoteShellArg(labels) : labels;
}

function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function validateSsmParameterStoreTags(tagsJson: string): { Key: string; Value: string }[] {
  try {
    const tags = JSON.parse(tagsJson);

    if (!Array.isArray(tags)) {
      throw new Error('Tags must be an array');
    }

    if (tags.length === 0) {
      return [];
    }

    tags.forEach((tag, index) => {
      if (typeof tag !== 'object' || tag === null) {
        throw new Error(`Tag at index ${index} must be an object`);
      }
      if (!tag.Key || typeof tag.Key !== 'string' || tag.Key.trim() === '') {
        throw new Error(`Tag at index ${index} has missing or invalid 'Key' property`);
      }
      if (!Object.prototype.hasOwnProperty.call(tag, 'Value') || typeof tag.Value !== 'string') {
        throw new Error(`Tag at index ${index} has missing or invalid 'Value' property`);
      }
    });

    return tags;
  } catch (err) {
    logger.error('Invalid SSM_PARAMETER_STORE_TAGS format', { error: err });
    throw new Error(`Failed to parse SSM_PARAMETER_STORE_TAGS: ${(err as Error).message}`);
  }
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

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const errorWithStatus = error as { status?: number; response?: { status?: number } };
  return errorWithStatus.status ?? errorWithStatus.response?.status;
}

async function resolveInstallationId(
  githubAppClient: Octokit,
  enableOrgLevel: boolean,
  payload: ActionRequestMessage,
): Promise<number> {
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

export async function getInstallationId(
  githubAppClient: Octokit,
  enableOrgLevel: boolean,
  payload: ActionRequestMessage,
): Promise<number> {
  if (payload.installationId !== 0) {
    return payload.installationId;
  }

  return resolveInstallationId(githubAppClient, enableOrgLevel, payload);
}

// Raised when the queued-check is asked about an event type it cannot interpret.
// Distinct from an API failure: no amount of retrying makes a check_run event
// answerable, so callers must not treat this as a transient fault.
export class UnsupportedEventError extends Error {
  constructor(eventType: string) {
    super(`Event ${eventType} is not supported`);
    this.name = 'UnsupportedEventError';
  }
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
    throw new UnsupportedEventError(payload.eventType);
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
          {
            tags: githubRunnerConfig.ssmParameterStoreTags,
          },
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
  source: LambdaRunnerSource = 'scale-up-lambda',
): Promise<string[]> {
  const instances = await createRunner({
    runnerType: githubRunnerConfig.runnerType,
    runnerOwner: githubRunnerConfig.runnerOwner,
    numberOfRunners,
    source,
    ...ec2RunnerConfig,
  });
  if (instances.length !== 0) {
    const failedInstances = await createStartRunnerConfig(githubRunnerConfig, instances, ghClient);

    // Terminate instances that failed to get configured to avoid waste
    if (failedInstances.length > 0) {
      logger.warn('Terminating instances that failed to get configured', {
        failedInstances,
        failedCount: failedInstances.length,
      });

      for (const instanceId of failedInstances) {
        try {
          await terminateRunner(instanceId);
        } catch (error) {
          logger.error('Failed to terminate instance', {
            instanceId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Remove failed instances from the returned list
      return instances.filter((id) => !failedInstances.includes(id));
    }
  }

  return instances;
}

function generateRunnerLabelsTags(labels: string[]): Tag[] {
  if (labels.length === 0) {
    return [];
  }

  const generatedTagValues = packRunnerLabelsTagValues(labels);
  const tagValues = generatedTagValues.slice(0, RUNNER_LABELS_TAG_MAX_COUNT);

  if (generatedTagValues.length > RUNNER_LABELS_TAG_MAX_COUNT) {
    logger.warn('GitHub runner label EC2 tags were truncated to avoid exceeding EC2 tag limits.', {
      maxRunnerLabelsTagCount: RUNNER_LABELS_TAG_MAX_COUNT,
    });
  }

  return tagValues.map((value, index) => ({
    Key: index === 0 ? RUNNER_LABELS_TAG_KEY : `${RUNNER_LABELS_TAG_KEY}:${index + 1}`,
    Value: value,
  }));
}

function packRunnerLabelsTagValues(labels: string[]): string[] {
  const runnerLabelsValue = labels.join(RUNNER_LABELS_TAG_VALUE_SEPARATOR);
  const characters = Array.from(runnerLabelsValue);
  const tagValues: string[] = [];

  for (let start = 0; start < characters.length; start += EC2_TAG_VALUE_MAX_LENGTH) {
    tagValues.push(characters.slice(start, start + EC2_TAG_VALUE_MAX_LENGTH).join(''));
  }

  return tagValues;
}

async function createGithubInstallationClient(
  githubAppClient: Octokit,
  enableOrgLevel: boolean,
  payload: ActionRequestMessage,
  ghesApiUrl: string,
): Promise<Octokit> {
  let installationId = await getInstallationId(githubAppClient, enableOrgLevel, payload);

  try {
    const ghAuth = await createGithubInstallationAuth(installationId, ghesApiUrl);
    return await createOctokitClient(ghAuth.token, ghesApiUrl);
  } catch (error) {
    if (payload.installationId === 0 || getErrorStatus(error) !== 404) {
      throw error;
    }

    installationId = await resolveInstallationId(githubAppClient, enableOrgLevel, payload);
    if (installationId === payload.installationId) {
      throw error;
    }

    logger.warn('Retrying GitHub installation auth with installation resolved for current app', {
      eventInstallationId: payload.installationId,
      resolvedInstallationId: installationId,
      repositoryOwner: payload.repositoryOwner,
      repositoryName: payload.repositoryName,
    });

    const ghAuth = await createGithubInstallationAuth(installationId, ghesApiUrl);
    return await createOctokitClient(ghAuth.token, ghesApiUrl);
  }
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
  const instanceTypePriorities = process.env.INSTANCE_TYPE_PRIORITIES
    ? (JSON.parse(process.env.INSTANCE_TYPE_PRIORITIES) as Record<string, number>)
    : undefined;
  const enableJobQueuedCheck = yn(process.env.ENABLE_JOB_QUEUED_CHECK, { default: true });
  const amiIdSsmParameterName = process.env.AMI_ID_SSM_PARAMETER_NAME;
  const runnerNamePrefix = process.env.RUNNER_NAME_PREFIX || '';
  const ssmConfigPath = process.env.SSM_CONFIG_PATH || '';
  const tracingEnabled = yn(process.env.POWERTOOLS_TRACE_ENABLED, { default: false });
  const onDemandFailoverOnError = process.env.ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS
    ? (JSON.parse(process.env.ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS) as [string])
    : [];
  const ssmParameterStoreTags: { Key: string; Value: string }[] =
    process.env.SSM_PARAMETER_STORE_TAGS && process.env.SSM_PARAMETER_STORE_TAGS.trim() !== ''
      ? validateSsmParameterStoreTags(process.env.SSM_PARAMETER_STORE_TAGS)
      : [];
  const scaleErrors = JSON.parse(process.env.SCALE_ERRORS) as [string];
  const useDedicatedHost = yn(process.env.USE_DEDICATED_HOST, { default: false });

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
    runnerOwner: string;
  };

  const validMessages = new Map<string, MessagesWithClient>();
  const rejectedMessageIds = new Set<string>();
  for (const payload of payloads) {
    const { eventType, messageId, repositoryName, repositoryOwner, labels } = payload;
    if (ephemeralEnabled && eventType !== 'workflow_job') {
      logger.warn(
        'Event is not supported in combination with ephemeral runners. Please ensure you have enabled workflow_job events.',
        { eventType, messageId },
      );

      rejectedMessageIds.add(messageId);

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

    const runnerOwner = enableOrgLevel
      ? payload.repositoryOwner
      : `${payload.repositoryOwner}/${payload.repositoryName}`;

    let key = runnerOwner;
    if (labels?.some((l) => l.startsWith('ghr-'))) {
      const dynamicLabelsHash = labelsHash(labels);
      key = `${key}/${dynamicLabelsHash}`;
    }

    let entry = validMessages.get(key);

    // If we've not seen this owner/repo before, we'll need to create a GitHub
    // client for it.
    if (entry === undefined) {
      const githubInstallationClient = await createGithubInstallationClient(
        githubAppClient,
        enableOrgLevel,
        payload,
        ghesApiUrl,
      );

      entry = {
        messages: [],
        githubInstallationClient,
        runnerOwner: runnerOwner,
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

  for (const [group, { githubInstallationClient, messages, runnerOwner }] of validMessages.entries()) {
    // Work out how much we want to scale up by.
    let scaleUp = 0;
    const queuedMessages: ActionRequestMessageSQS[] = [];

    let ec2OverrideConfig: Ec2OverrideConfig | undefined = undefined;

    // Reset per group to avoid accumulating labels across iterations
    let groupRunnerLabels = runnerLabels;

    const messageLabels = messages.length > 0 ? (messages[0].labels ?? []) : [];
    const dynamicEC2Labels = messageLabels.map((l) => l.trim()).filter((l) => l.startsWith('ghr-ec2-'));
    const nonEc2DynamicLabels = messageLabels
      .map((l) => l.trim())
      .filter((l) => l.startsWith('ghr-') && !l.startsWith('ghr-ec2-'));
    const allDynamicLabels = [...nonEc2DynamicLabels, ...dynamicEC2Labels];

    if (allDynamicLabels.length > 0) {
      logger.debug('Dynamic labels present on message', { labels: allDynamicLabels });
      groupRunnerLabels = groupRunnerLabels
        ? `${groupRunnerLabels},${allDynamicLabels.join(',')}`
        : allDynamicLabels.join(',');
      logger.debug('Updated runner labels', { runnerLabels: groupRunnerLabels });

      if (dynamicEC2Labels.length > 0) {
        const defaultBlockDeviceName = shouldLoadLaunchTemplateBlockDeviceName(dynamicEC2Labels)
          ? await getDefaultBlockDeviceNameFromLaunchTemplate(launchTemplateName)
          : undefined;

        ec2OverrideConfig = parseEc2OverrideConfig(dynamicEC2Labels, defaultBlockDeviceName);
        if (ec2OverrideConfig) {
          logger.debug('EC2 override config parsed from labels', { ec2OverrideConfig });
        }
      }
    }

    for (const message of messages) {
      const messageLogger = logger.createChild({
        persistentKeys: {
          eventType: message.eventType,
          group,
          messageId: message.messageId,
          repository: `${message.repositoryOwner}/${message.repositoryName}`,
          labels: message.labels,
        },
      });

      if (enableJobQueuedCheck) {
        let jobQueued = true;
        try {
          jobQueued = await isJobQueued(githubInstallationClient, message);
        } catch (e) {
          // An unsupported event type is not a transient fault — the check can never
          // succeed for it, so let it propagate rather than silently scaling up.
          if (e instanceof UnsupportedEventError) {
            throw e;
          }
          const err = e as Error & { status?: number };
          messageLogger.warn('isJobQueued check failed, assuming job is still queued (fail-open)', {
            error: err.message,
            status: err.status,
          });
        }
        if (!jobQueued) {
          messageLogger.info('No runner will be created, job is not queued.');
          continue;
        }
      }

      scaleUp++;
      queuedMessages.push(message);
    }

    if (scaleUp === 0) {
      logger.info('No runners will be created for this group, no valid messages found.');

      continue;
    }

    // Don't call the EC2 API if we can create an unlimited number of runners.
    const currentRunners =
      maximumRunners === -1 ? 0 : (await listEC2Runners({ environment, runnerType, runnerOwner: runnerOwner })).length;

    logger.info('Current runners', {
      currentRunners,
      maximumRunners,
    });

    // Calculate how many runners we want to create.
    // Use Math.max(0, ...) to ensure we never attempt to create a negative number of runners,
    // which can happen when currentRunners exceeds maximumRunners due to pool/scale-up race conditions.
    const newRunners =
      maximumRunners === -1
        ? // If we don't have an upper limit, scale up by the number of new jobs.
          scaleUp
        : // Otherwise, we do have a limit, so work out if `scaleUp` would exceed it.
          Math.max(0, Math.min(scaleUp, maximumRunners - currentRunners));

    const missingInstanceCount = Math.max(0, scaleUp - newRunners);

    if (missingInstanceCount > 0) {
      logger.info('Not all runners will be created for this group, maximum number of runners reached.', {
        desiredNewRunners: scaleUp,
      });

      if (ephemeralEnabled) {
        // This removes `missingInstanceCount` items from the start of the array
        // so that, if we retry more messages later, we pick fresh ones.
        const removedMessages = messages.splice(0, missingInstanceCount);
        removedMessages.forEach(({ messageId }) => rejectedMessageIds.add(messageId));
      }

      // No runners will be created, so skip calling the EC2 API.
      if (newRunners <= 0) {
        // Publish retry messages for messages that are not rejected
        for (const message of queuedMessages) {
          if (!rejectedMessageIds.has(message.messageId)) {
            await publishRetryMessage(message as ActionRequestMessageRetry);
          }
        }
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
        runnerLabels: groupRunnerLabels,
        runnerGroup,
        runnerNamePrefix,
        runnerOwner: runnerOwner,
        runnerType,
        disableAutoUpdate,
        ssmTokenPath,
        ssmConfigPath,
        ssmParameterStoreTags,
      },
      {
        ec2instanceCriteria: {
          instanceTypes,
          instanceTypePriorities,
          targetCapacityType: instanceTargetCapacityType,
          maxSpotPrice: instanceMaxSpotPrice,
          instanceAllocationStrategy: instanceAllocationStrategy,
        },
        ec2OverrideConfig,
        environment,
        launchTemplateName,
        subnets,
        amiIdSsmParameterName,
        tracingEnabled,
        onDemandFailoverOnError,
        scaleErrors,
        useDedicatedHost,
      },
      newRunners,
      githubInstallationClient,
      'scale-up-lambda',
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

      const failedMessages = messages.slice(0, failedInstanceCount);
      failedMessages.forEach(({ messageId }) => rejectedMessageIds.add(messageId));
    }

    // Publish retry messages for messages that are not rejected
    for (const message of queuedMessages) {
      if (!rejectedMessageIds.has(message.messageId)) {
        await publishRetryMessage(message as ActionRequestMessageRetry);
      }
    }
  }

  return Array.from(rejectedMessageIds);
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

/**
 * Creates the start configuration for runner instances by either generating JIT configs
 * or registration tokens.
 *
 * @returns Array of instance IDs that failed to get configured
 */
async function createStartRunnerConfig(
  githubRunnerConfig: CreateGitHubRunnerConfig,
  instances: string[],
  ghClient: Octokit,
): Promise<string[]> {
  if (githubRunnerConfig.enableJitConfig && githubRunnerConfig.ephemeral) {
    return await createJitConfig(githubRunnerConfig, instances, ghClient);
  } else {
    return await createRegistrationTokenConfig(githubRunnerConfig, instances, ghClient);
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

/**
 * Creates registration token configuration for non-ephemeral runners.
 *
 * @returns Empty array (this configuration method does not have failure cases)
 */
async function createRegistrationTokenConfig(
  githubRunnerConfig: CreateGitHubRunnerConfig,
  instances: string[],
  ghClient: Octokit,
): Promise<string[]> {
  const { isDelay, delay } = addDelay(instances);
  const token = await getGithubRunnerRegistrationToken(githubRunnerConfig, ghClient);
  const runnerServiceConfig = generateRunnerServiceConfig(githubRunnerConfig, token);

  logger.debug('Runner service config for non-ephemeral runners', {
    runner_service_config: removeTokenFromLogging(runnerServiceConfig),
  });

  for (const instance of instances) {
    await putParameter(`${githubRunnerConfig.ssmTokenPath}/${instance}`, runnerServiceConfig.join(' '), true, {
      tags: [{ Key: 'InstanceId', Value: instance }, ...githubRunnerConfig.ssmParameterStoreTags],
    });
    if (isDelay) {
      // Delay to prevent AWS ssm rate limits by being within the max throughput limit
      await delay(25);
    }
  }

  return [];
}

async function tagRunnerMetadata(instanceId: string, runnerId: string, runnerLabels: string[]): Promise<void> {
  const tags = [{ Key: 'ghr:github_runner_id', Value: runnerId }, ...generateRunnerLabelsTags(runnerLabels)];

  try {
    await tag(instanceId, tags);
  } catch (e) {
    logger.error(`Failed to mark runner '${instanceId}' with GitHub runner metadata.`, { error: e });
  }
}

/**
 * Creates JIT (Just-In-Time) configuration for ephemeral runners.
 * Continues processing remaining instances even if some fail.
 *
 * @returns Array of instance IDs that failed to get JIT configuration
 */
async function createJitConfig(
  githubRunnerConfig: CreateGitHubRunnerConfig,
  instances: string[],
  ghClient: Octokit,
): Promise<string[]> {
  const runnerGroupId = await getRunnerGroupId(githubRunnerConfig, ghClient);
  const { isDelay, delay } = addDelay(instances);
  const runnerLabels = githubRunnerConfig.runnerLabels.split(',');
  const failedInstances: string[] = [];

  logger.debug(`Runner group id: ${runnerGroupId}`);
  logger.debug(`Runner labels: ${runnerLabels}`);
  for (const instance of instances) {
    try {
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

      // tag the EC2 instance with GitHub runner metadata
      await tagRunnerMetadata(instance, runnerConfig.data.runner.id.toString(), runnerLabels);

      // store jit config in ssm parameter store
      logger.debug('Runner JIT config for ephemeral runner generated.', {
        instance: instance,
      });
      await putParameter(`${githubRunnerConfig.ssmTokenPath}/${instance}`, runnerConfig.data.encoded_jit_config, true, {
        tags: [{ Key: 'InstanceId', Value: instance }, ...githubRunnerConfig.ssmParameterStoreTags],
      });
      if (isDelay) {
        // Delay to prevent AWS ssm rate limits by being within the max throughput limit
        await delay(25);
      }
    } catch (error) {
      failedInstances.push(instance);
      logger.warn('Failed to create JIT config for instance, continuing with remaining instances', {
        instance: instance,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (failedInstances.length > 0) {
    logger.error('Failed to create JIT config for some instances', {
      failedInstances: failedInstances,
      totalInstances: instances.length,
      successfulInstances: instances.length - failedInstances.length,
    });
  }

  return failedInstances;
}

/**
 * Parses EC2 override configuration from GitHub labels.
 *
 * Supported label formats:
 *
 * Basic Fleet Overrides:
 * - ghr-ec2-instance-type:<type>              - Set specific instance type (e.g., c5.xlarge)
 * - ghr-ec2-max-price:<price>                 - Set maximum spot price
 * - ghr-ec2-subnet-id:<id>                    - Set subnet ID
 * - ghr-ec2-availability-zone:<zone>          - Set availability zone
 * - ghr-ec2-availability-zone-id:<id>         - Set availability zone ID
 * - ghr-ec2-weighted-capacity:<number>        - Set weighted capacity
 * - ghr-ec2-priority:<number>                 - Set launch priority
 * - ghr-ec2-image-id:<ami-id>                 - Override AMI ID
 *
 * Instance Requirements (vCPU & Memory):
 * - ghr-ec2-vcpu-count-min:<number>           - Set minimum vCPU count
 * - ghr-ec2-vcpu-count-max:<number>           - Set maximum vCPU count
 * - ghr-ec2-memory-mib-min:<number>           - Set minimum memory in MiB
 * - ghr-ec2-memory-mib-max:<number>           - Set maximum memory in MiB
 * - ghr-ec2-memory-gib-per-vcpu-min:<number>  - Set min memory per vCPU ratio
 * - ghr-ec2-memory-gib-per-vcpu-max:<number>  - Set max memory per vCPU ratio
 *
 * Instance Requirements (CPU & Performance):
 * - ghr-ec2-cpu-manufacturers:<list>          - CPU manufacturers (semicolon-separated: intel;amd;amazon-web-services)
 * - ghr-ec2-instance-generations:<list>       - Instance generations (semicolon-separated: current;previous)
 * - ghr-ec2-excluded-instance-types:<list>    - Exclude instance types (semicolon-separated)
 * - ghr-ec2-allowed-instance-types:<list>     - Allow only specific instance types (semicolon-separated)
 * - ghr-ec2-burstable-performance:<value>     - Burstable performance (included,excluded,required)
 * - ghr-ec2-bare-metal:<value>                - Bare metal (included,excluded,required)
 *
 * Instance Requirements (Accelerators/GPU):
 * - ghr-ec2-accelerator-types:<list>          - Accelerator types (semicolon-separated: gpu;fpga;inference)
 * - ghr-ec2-accelerator-count-min:<num>       - Set minimum accelerator count
 * - ghr-ec2-accelerator-count-max:<num>       - Set maximum accelerator count
 * - ghr-ec2-accelerator-manufacturers:<list>  - Accelerator manufacturers (semicolon-separated: nvidia;amd;amazon-web-services;xilinx)
 * - ghr-ec2-accelerator-names:<list>          - Specific accelerator names (semicolon-separated)
 * - ghr-ec2-accelerator-total-memory-mib-min:<num> - Min accelerator total memory in MiB
 * - ghr-ec2-accelerator-total-memory-mib-max:<num> - Max accelerator total memory in MiB
 *
 * Instance Requirements (Network & Storage):
 * - ghr-ec2-network-interface-count-min:<num> - Min network interfaces
 * - ghr-ec2-network-interface-count-max:<num> - Max network interfaces
 * - ghr-ec2-network-bandwidth-gbps-min:<num>  - Min network bandwidth in Gbps
 * - ghr-ec2-network-bandwidth-gbps-max:<num>  - Max network bandwidth in Gbps
 * - ghr-ec2-local-storage:<value>             - Local storage (included,excluded,required)
 * - ghr-ec2-local-storage-types:<list>        - Local storage types (semicolon-separated: hdd;ssd)
 * - ghr-ec2-total-local-storage-gb-min:<num>  - Min total local storage in GB
 * - ghr-ec2-total-local-storage-gb-max:<num>  - Max total local storage in GB
 * - ghr-ec2-baseline-ebs-bandwidth-mbps-min:<num> - Min baseline EBS bandwidth in Mbps
 * - ghr-ec2-baseline-ebs-bandwidth-mbps-max:<num> - Max baseline EBS bandwidth in Mbps
 *
 * Placement:
 * - ghr-ec2-placement-group-name:<name>       - Placement group name
 * - ghr-ec2-placement-group-id:<id>           - Placement group ID
 * - ghr-ec2-placement-tenancy:<value>         - Tenancy (default,dedicated,host)
 * - ghr-ec2-placement-host-id:<id>            - Dedicated host ID
 * - ghr-ec2-placement-affinity:<value>        - Affinity (default,host)
 * - ghr-ec2-placement-partition-number:<num>  - Partition number
 * - ghr-ec2-placement-availability-zone:<zone> - Placement availability zone
 * - ghr-ec2-placement-availability-zone-id:<id> - Placement availability zone ID
 * - ghr-ec2-placement-spread-domain:<domain>  - Spread domain
 * - ghr-ec2-placement-host-resource-group-arn:<arn> - Host resource group ARN
 *
 * Block Device Mappings:
 * - ghr-ec2-block-device-name:<name>          - Block device name
 * - ghr-ec2-ebs-volume-size:<size>            - EBS volume size in GB
 * - ghr-ec2-ebs-volume-type:<type>            - EBS volume type (gp2,gp3,io1,io2,st1,sc1)
 * - ghr-ec2-ebs-iops:<number>                 - EBS IOPS
 * - ghr-ec2-ebs-throughput:<number>           - EBS throughput in MB/s (gp3 only)
 * - ghr-ec2-ebs-encrypted:<boolean>           - EBS encryption (true,false)
 * - ghr-ec2-ebs-kms-key-id:<id>               - KMS key ID for encryption
 * - ghr-ec2-ebs-delete-on-termination:<bool>  - Delete on termination (true,false)
 * - ghr-ec2-ebs-snapshot-id:<id>              - Snapshot ID for EBS volume
 * - ghr-ec2-block-device-virtual-name:<name>  - Virtual device name (ephemeral storage)
 * - ghr-ec2-block-device-no-device:<string>   - Suppresses device mapping
 *
 * Pricing & Advanced:
 * - ghr-ec2-spot-max-price-percentage-over-lowest-price:<num> - Spot max price as % over lowest price
 * - ghr-ec2-on-demand-max-price-percentage-over-lowest-price:<num> - On-demand max price as % over lowest price
 * - ghr-ec2-max-spot-price-as-percentage-of-optimal-on-demand-price:<num> - Max spot price as % of optimal on-demand
 * - ghr-ec2-require-hibernate-support:<bool>  - Require hibernate support (true,false)
 * - ghr-ec2-require-encryption-in-transit:<bool> - Require encryption in-transit (true,false)
 * - ghr-ec2-baseline-performance-factors-cpu-reference-families:<families> - CPU baseline performance reference families (semicolon-separated)
 *
 * Example:
 *   runs-on: [self-hosted, linux, ghr-ec2-vcpu-count-min:4, ghr-ec2-memory-mib-min:16384, ghr-ec2-accelerator-types:gpu]
 *
 * @param labels - Array of GitHub workflow job labels
 * @param defaultBlockDeviceName - Device name to use when dynamic block device labels create a mapping
 * @returns EC2 override configuration object or undefined if no valid config found
 */
export function parseEc2OverrideConfig(
  labels: string[],
  defaultBlockDeviceName?: string,
): Ec2OverrideConfig | undefined {
  const ec2Labels = labels.filter((l) => l.startsWith('ghr-ec2-'));
  const config: Ec2OverrideConfig = {};

  for (const label of ec2Labels) {
    const [key, ...valueParts] = label.replace('ghr-ec2-', '').split(':');
    const value = valueParts.join(':');

    if (!value) continue;

    // Basic Fleet Overrides
    if (key === 'instance-type') {
      config.InstanceType = value as _InstanceType;
    } else if (key === 'subnet-id') {
      config.SubnetId = value;
    } else if (key === 'availability-zone') {
      config.AvailabilityZone = value;
    } else if (key === 'availability-zone-id') {
      config.AvailabilityZoneId = value;
    } else if (key === 'max-price') {
      config.MaxPrice = value;
    } else if (key === 'priority') {
      config.Priority = parseFloat(value);
    } else if (key === 'weighted-capacity') {
      config.WeightedCapacity = parseFloat(value);
    } else if (key === 'image-id') {
      config.ImageId = value;
    }

    // Placement
    else if (key.startsWith('placement-')) {
      config.Placement = config.Placement || ({} as Placement);
      const placementKey = key.replace('placement-', '');
      if (placementKey === 'availability-zone-id') {
        config.Placement.AvailabilityZoneId = value;
      } else if (placementKey === 'affinity') {
        config.Placement.Affinity = value;
      } else if (placementKey === 'group-name') {
        config.Placement.GroupName = value;
      } else if (placementKey === 'partition-number') {
        config.Placement.PartitionNumber = parseInt(value, 10);
      } else if (placementKey === 'host-id') {
        config.Placement.HostId = value;
      } else if (placementKey === 'tenancy') {
        config.Placement.Tenancy = value as Tenancy;
      } else if (placementKey === 'spread-domain') {
        config.Placement.SpreadDomain = value;
      } else if (placementKey === 'host-resource-group-arn') {
        config.Placement.HostResourceGroupArn = value;
      } else if (placementKey === 'group-id') {
        config.Placement.GroupId = value;
      } else if (placementKey === 'availability-zone') {
        config.Placement.AvailabilityZone = value;
      }
    }

    // Block Device Mappings
    else if (key === 'block-device-name') {
      getOrCreateBlockDeviceMapping(config, defaultBlockDeviceName).DeviceName = value;
    } else if (key === 'block-device-virtual-name') {
      getOrCreateBlockDeviceMapping(config, defaultBlockDeviceName).VirtualName = value;
    } else if (key.startsWith('ebs-')) {
      const blockDeviceMapping = getOrCreateBlockDeviceMapping(config, defaultBlockDeviceName);
      const ebsKey = key.replace('ebs-', '');
      const ebs = blockDeviceMapping.Ebs || (blockDeviceMapping.Ebs = {} as FleetEbsBlockDeviceRequest);

      if (ebsKey === 'encrypted') {
        ebs.Encrypted = value.toLowerCase() === 'true';
      } else if (ebsKey === 'delete-on-termination') {
        ebs.DeleteOnTermination = value.toLowerCase() === 'true';
      } else if (ebsKey === 'iops') {
        ebs.Iops = parseInt(value, 10);
      } else if (ebsKey === 'throughput') {
        ebs.Throughput = parseInt(value, 10);
      } else if (ebsKey === 'kms-key-id') {
        ebs.KmsKeyId = value;
      } else if (ebsKey === 'snapshot-id') {
        ebs.SnapshotId = value;
      } else if (ebsKey === 'volume-size') {
        ebs.VolumeSize = parseInt(value, 10);
      } else if (ebsKey === 'volume-type') {
        ebs.VolumeType = value as VolumeType;
      }
    } else if (key === 'block-device-no-device') {
      getOrCreateBlockDeviceMapping(config, defaultBlockDeviceName).NoDevice = value;
    }

    // Instance Requirements
    else if (key.startsWith('vcpu-count-')) {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.VCpuCount = config.InstanceRequirements.VCpuCount || ({} as VCpuCountRangeRequest);
      const subKey = key.replace('vcpu-count-', '');
      config.InstanceRequirements.VCpuCount![subKey === 'min' ? 'Min' : 'Max'] = parseInt(value, 10);
    } else if (key.startsWith('memory-mib-')) {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.MemoryMiB = config.InstanceRequirements.MemoryMiB || ({} as MemoryMiBRequest);
      const subKey = key.replace('memory-mib-', '');
      config.InstanceRequirements.MemoryMiB![subKey === 'min' ? 'Min' : 'Max'] = parseInt(value, 10);
    } else if (key === 'cpu-manufacturers') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.CpuManufacturers = splitEc2OverrideListValue(value) as CpuManufacturer[];
    } else if (key.startsWith('memory-gib-per-vcpu-')) {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.MemoryGiBPerVCpu =
        config.InstanceRequirements.MemoryGiBPerVCpu || ({} as MemoryGiBPerVCpuRequest);
      const subKey = key.replace('memory-gib-per-vcpu-', '');
      config.InstanceRequirements.MemoryGiBPerVCpu![subKey === 'min' ? 'Min' : 'Max'] = parseFloat(value);
    } else if (key === 'excluded-instance-types') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.ExcludedInstanceTypes = splitEc2OverrideListValue(value);
    } else if (key === 'instance-generations') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.InstanceGenerations = splitEc2OverrideListValue(value) as InstanceGeneration[];
    } else if (key === 'spot-max-price-percentage-over-lowest-price') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.SpotMaxPricePercentageOverLowestPrice = parseInt(value, 10);
    } else if (key === 'on-demand-max-price-percentage-over-lowest-price') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.OnDemandMaxPricePercentageOverLowestPrice = parseInt(value, 10);
    } else if (key === 'bare-metal') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.BareMetal = value as BareMetal;
    } else if (key === 'burstable-performance') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.BurstablePerformance = value as BurstablePerformance;
    } else if (key === 'require-hibernate-support') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.RequireHibernateSupport = value.toLowerCase() === 'true';
    } else if (key.startsWith('network-interface-count-')) {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.NetworkInterfaceCount =
        config.InstanceRequirements.NetworkInterfaceCount || ({} as NetworkInterfaceCountRequest);
      const subKey = key.replace('network-interface-count-', '');
      config.InstanceRequirements.NetworkInterfaceCount![subKey === 'min' ? 'Min' : 'Max'] = parseInt(value, 10);
    } else if (key === 'local-storage') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.LocalStorage = value as LocalStorage;
    } else if (key === 'local-storage-types') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.LocalStorageTypes = splitEc2OverrideListValue(value) as LocalStorageType[];
    } else if (key.startsWith('total-local-storage-gb-')) {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.TotalLocalStorageGB =
        config.InstanceRequirements.TotalLocalStorageGB || ({} as TotalLocalStorageGBRequest);
      const subKey = key.replace('total-local-storage-gb-', '');
      config.InstanceRequirements.TotalLocalStorageGB![subKey === 'min' ? 'Min' : 'Max'] = parseFloat(value);
    } else if (key.startsWith('baseline-ebs-bandwidth-mbps-')) {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.BaselineEbsBandwidthMbps =
        config.InstanceRequirements.BaselineEbsBandwidthMbps || ({} as BaselineEbsBandwidthMbpsRequest);
      const subKey = key.replace('baseline-ebs-bandwidth-mbps-', '');
      config.InstanceRequirements.BaselineEbsBandwidthMbps![subKey === 'min' ? 'Min' : 'Max'] = parseInt(value, 10);
    } else if (key === 'accelerator-types') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.AcceleratorTypes = splitEc2OverrideListValue(value) as AcceleratorType[];
    } else if (key.startsWith('accelerator-count-')) {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.AcceleratorCount =
        config.InstanceRequirements.AcceleratorCount || ({} as AcceleratorCountRequest);
      const subKey = key.replace('accelerator-count-', '');
      config.InstanceRequirements.AcceleratorCount![subKey === 'min' ? 'Min' : 'Max'] = parseInt(value, 10);
    } else if (key === 'accelerator-manufacturers') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.AcceleratorManufacturers = splitEc2OverrideListValue(
        value,
      ) as AcceleratorManufacturer[];
    } else if (key === 'accelerator-names') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.AcceleratorNames = splitEc2OverrideListValue(value) as AcceleratorName[];
    } else if (key.startsWith('accelerator-total-memory-mib-')) {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.AcceleratorTotalMemoryMiB =
        config.InstanceRequirements.AcceleratorTotalMemoryMiB || ({} as AcceleratorTotalMemoryMiBRequest);
      const subKey = key.replace('accelerator-total-memory-mib-', '');
      config.InstanceRequirements.AcceleratorTotalMemoryMiB![subKey === 'min' ? 'Min' : 'Max'] = parseInt(value, 10);
    } else if (key.startsWith('network-bandwidth-gbps-')) {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.NetworkBandwidthGbps =
        config.InstanceRequirements.NetworkBandwidthGbps || ({} as NetworkBandwidthGbpsRequest);
      const subKey = key.replace('network-bandwidth-gbps-', '');
      config.InstanceRequirements.NetworkBandwidthGbps![subKey === 'min' ? 'Min' : 'Max'] = parseFloat(value);
    } else if (key === 'allowed-instance-types') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.AllowedInstanceTypes = splitEc2OverrideListValue(value);
    } else if (key === 'max-spot-price-as-percentage-of-optimal-on-demand-price') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.MaxSpotPriceAsPercentageOfOptimalOnDemandPrice = parseInt(value, 10);
    } else if (key === 'baseline-performance-factors-cpu-reference-families') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.BaselinePerformanceFactors =
        config.InstanceRequirements.BaselinePerformanceFactors || ({} as BaselinePerformanceFactorsRequest);
      config.InstanceRequirements.BaselinePerformanceFactors.Cpu =
        config.InstanceRequirements.BaselinePerformanceFactors.Cpu || ({} as CpuPerformanceFactorRequest);
      config.InstanceRequirements.BaselinePerformanceFactors.Cpu.References = splitEc2OverrideListValue(value).map(
        (family) => ({ InstanceFamily: family }),
      ) as PerformanceFactorReferenceRequest[];
    } else if (key === 'require-encryption-in-transit') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.RequireEncryptionInTransit = value.toLowerCase() === 'true';
    }
  }

  return Object.keys(config).length > 0 ? config : undefined;
}

function splitEc2OverrideListValue(value: string): string[] {
  return value.split(EC2_OVERRIDE_LIST_VALUE_SEPARATOR);
}

function getOrCreateBlockDeviceMapping(
  config: Ec2OverrideConfig,
  defaultBlockDeviceName?: string,
): FleetBlockDeviceMappingRequest {
  config.BlockDeviceMappings =
    config.BlockDeviceMappings ||
    ([defaultBlockDeviceName ? { DeviceName: defaultBlockDeviceName } : {}] as FleetBlockDeviceMappingRequest[]);
  return config.BlockDeviceMappings[0];
}

function shouldLoadLaunchTemplateBlockDeviceName(labels: string[]): boolean {
  const blockDeviceNameLabel = 'ghr-ec2-block-device-name:';
  let hasBlockDeviceOverride = false;
  let hasBlockDeviceName = false;

  for (const label of labels) {
    hasBlockDeviceOverride =
      hasBlockDeviceOverride || label.startsWith('ghr-ec2-ebs-') || label.startsWith('ghr-ec2-block-device-');

    hasBlockDeviceName =
      hasBlockDeviceName || (label.startsWith(blockDeviceNameLabel) && label.slice(blockDeviceNameLabel.length) !== '');
  }

  return hasBlockDeviceOverride && !hasBlockDeviceName;
}

async function getDefaultBlockDeviceNameFromLaunchTemplate(launchTemplateName: string): Promise<string> {
  const ec2Client = getTracedAWSV3Client(new EC2Client({ region: process.env.AWS_REGION }));
  const launchTemplateVersions = await ec2Client.send(
    new DescribeLaunchTemplateVersionsCommand({
      LaunchTemplateName: launchTemplateName,
      Versions: ['$Default'],
    }),
  );
  const blockDeviceMappings =
    launchTemplateVersions.LaunchTemplateVersions?.[0]?.LaunchTemplateData?.BlockDeviceMappings;
  const blockDeviceName =
    blockDeviceMappings?.find((blockDeviceMapping) => blockDeviceMapping.DeviceName && blockDeviceMapping.Ebs)
      ?.DeviceName ?? blockDeviceMappings?.find((blockDeviceMapping) => blockDeviceMapping.DeviceName)?.DeviceName;

  if (!blockDeviceName) {
    throw new Error(`Failed to determine block device name from launch template '${launchTemplateName}'.`);
  }

  return blockDeviceName;
}

function labelsHash(labels: string[]): string {
  const prefix = 'ghr-';

  const input = labels
    .filter((l) => l.startsWith(prefix))
    .sort() // ensure deterministic hash
    .join('|');

  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0; // force 32-bit integer
  }

  return Math.abs(hash).toString(36);
}
