import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import type {
  CreateGitHubRunnerConfig,
  CreateRunnerResult,
  CreateStartRunnerConfig,
  GitHubRunnerMetadata,
  LambdaRunnerSource,
  StartRunnerConfigOptions,
} from '../../../../core';
import { Octokit } from '@octokit/rest';
import type { Tag } from '@aws-sdk/client-ec2';
import yn from 'yn';

import { createRunner, tag, terminateRunner } from './runners';
import type { RunnerInputParameters } from './runners.d';

const logger = createChildLogger('ec2-runners');
const RUNNER_LABELS_TAG_KEY = 'ghr:runner_labels';
const RUNNER_LABELS_TAG_VALUE_SEPARATOR = ',';
export const EC2_TAG_VALUE_MAX_LENGTH = 256;
export const RUNNER_LABELS_TAG_MAX_COUNT = 5;

export interface Ec2ProviderConfig {
  environment: string;
  subnets: string[];
  launchTemplateName: string;
  ec2instanceCriteria: RunnerInputParameters['ec2instanceCriteria'];
  amiIdSsmParameterName?: string;
  tracingEnabled?: boolean;
  onDemandFailoverOnError?: string[];
  scaleErrors: string[];
}

export interface CreateEC2RunnerConfig extends Ec2ProviderConfig {
  ec2OverrideConfig?: RunnerInputParameters['ec2OverrideConfig'];
  numberOfRunners?: number;
  useDedicatedHost?: boolean;
}

export function loadEc2ProviderConfig(): Ec2ProviderConfig {
  return {
    environment: process.env.ENVIRONMENT,
    subnets: process.env.SUBNET_IDS.split(','),
    launchTemplateName: process.env.LAUNCH_TEMPLATE_NAME,
    ec2instanceCriteria: {
      instanceTypes: process.env.INSTANCE_TYPES.split(','),
      instanceTypePriorities: process.env.INSTANCE_TYPE_PRIORITIES
        ? (JSON.parse(process.env.INSTANCE_TYPE_PRIORITIES) as Record<string, number>)
        : undefined,
      targetCapacityType: process.env.INSTANCE_TARGET_CAPACITY_TYPE,
      maxSpotPrice: process.env.INSTANCE_MAX_SPOT_PRICE,
      instanceAllocationStrategy: process.env.INSTANCE_ALLOCATION_STRATEGY || 'lowest-price',
    },
    amiIdSsmParameterName: process.env.AMI_ID_SSM_PARAMETER_NAME,
    tracingEnabled: yn(process.env.POWERTOOLS_TRACE_ENABLED, { default: false }),
    onDemandFailoverOnError: process.env.ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS
      ? (JSON.parse(process.env.ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS) as string[])
      : [],
    scaleErrors: JSON.parse(process.env.SCALE_ERRORS) as string[],
  };
}

export async function createRunners(
  githubRunnerConfig: CreateGitHubRunnerConfig,
  ec2RunnerConfig: CreateEC2RunnerConfig,
  numberOfRunners: number,
  ghClient: Octokit,
  createStartRunnerConfig: CreateStartRunnerConfig,
  source: LambdaRunnerSource = 'scale-up-lambda',
): Promise<CreateRunnerResult> {
  let result: CreateRunnerResult;
  try {
    result = await createRunner({
      runnerType: githubRunnerConfig.runnerType,
      runnerOwner: githubRunnerConfig.runnerOwner,
      numberOfRunners,
      source,
      ...ec2RunnerConfig,
    });
  } catch (error) {
    logger.error('Unexpected error while creating EC2 runner instances.', {
      error,
      retryable: true,
      failedInstanceCount: numberOfRunners,
    });
    return { instances: [], retryableErrorCount: numberOfRunners, nonRetryableErrorCount: 0 };
  }

  if (result.instances.length !== 0) {
    let failedInstances: string[];
    try {
      failedInstances = await createStartRunnerConfig(
        githubRunnerConfig,
        result.instances,
        ghClient,
        createEc2StartRunnerConfigOptions(),
      );
    } catch (error) {
      logger.error('Unexpected error while registering GitHub runners.', {
        error,
        retryable: true,
        failedInstances: result.instances,
        failedInstanceCount: result.instances.length,
      });
      failedInstances = result.instances;
    }

    // Terminate instances that failed to get configured to avoid waste
    if (failedInstances.length > 0) {
      logger.warn('Terminating instances that failed to get configured', {
        failedInstances,
        failedInstanceCount: failedInstances.length,
        retryable: true,
      });

      await terminateFailedInstances(failedInstances);

      return {
        instances: result.instances.filter((id) => !failedInstances.includes(id)),
        retryableErrorCount: result.retryableErrorCount + failedInstances.length,
        nonRetryableErrorCount: result.nonRetryableErrorCount,
      };
    }
  }

  return result;
}

async function terminateFailedInstances(instanceIds: string[]): Promise<void> {
  for (const instanceId of instanceIds) {
    try {
      await terminateRunner(instanceId);
    } catch (error) {
      logger.error('Failed to terminate instance', {
        instanceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function createEc2StartRunnerConfigOptions(): StartRunnerConfigOptions {
  return {
    getSsmParameterTags: (instanceId) => [{ Key: 'InstanceId', Value: instanceId }],
    onJitConfigCreated: async (instanceId, metadata) => await tagEc2RunnerMetadata(instanceId, metadata),
  };
}

async function tagEc2RunnerMetadata(instanceId: string, metadata: GitHubRunnerMetadata): Promise<void> {
  const tags = [
    { Key: 'ghr:github_runner_id', Value: metadata.githubRunnerId },
    ...generateRunnerLabelsTags(metadata.runnerLabels),
  ];

  try {
    await tag(instanceId, tags);
  } catch (e) {
    logger.error(`Failed to mark EC2 runner '${instanceId}' with GitHub runner metadata.`, { error: e });
  }
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
