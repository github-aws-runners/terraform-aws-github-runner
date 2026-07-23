import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { Octokit } from '@octokit/rest';
import type { Tag } from '@aws-sdk/client-ec2';

import { createRunner, tag, terminateRunner } from '../aws/ec2-runners';
import type { RunnerInputParameters } from '../aws/ec2-runners.d';
import { createStartRunnerConfig } from './github-runner';
import type { GitHubRunnerMetadata, StartRunnerConfigOptions } from './github-runner';
import type { CreateGitHubRunnerConfig, LambdaRunnerSource } from './types';

const logger = createChildLogger('ec2-scale-up');
const RUNNER_LABELS_TAG_KEY = 'ghr:runner_labels';
const RUNNER_LABELS_TAG_VALUE_SEPARATOR = ',';
export const EC2_TAG_VALUE_MAX_LENGTH = 256;
export const RUNNER_LABELS_TAG_MAX_COUNT = 5;

export interface CreateEC2RunnerConfig {
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
    const failedInstances = await createStartRunnerConfig(
      githubRunnerConfig,
      instances,
      ghClient,
      createEc2StartRunnerConfigOptions(),
    );

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
