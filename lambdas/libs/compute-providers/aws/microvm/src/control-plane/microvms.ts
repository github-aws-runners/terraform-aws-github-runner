import { randomUUID } from 'node:crypto';

import { createChildLogger, getTracedAWSV3Client } from '@aws-github-runner/aws-powertools-util';
import {
  LambdaMicrovmsClient,
  ListMicrovmsCommand,
  ListTagsCommand,
  RunMicrovmCommand,
  TagResourceCommand,
  TerminateMicrovmCommand,
  UntagResourceCommand,
} from '@aws-sdk/client-lambda-microvms';
import type { MicrovmItem, MicrovmState, RunMicrovmCommandInput } from '@aws-sdk/client-lambda-microvms';

import type { LambdaRunnerSource, ListRunnerFilters, RunnerInfo, RunnerType } from '../../../../core';
import type { MicrovmProviderConfig } from './config';

const logger = createChildLogger('microvm-runners');

const APPLICATION_TAG = 'ghr:Application';
const APPLICATION_TAG_VALUE = 'github-action-runner';
const ACTIVE_STATES = new Set<MicrovmState>(['PENDING', 'RUNNING', 'SUSPENDING', 'SUSPENDED']);

export interface MicrovmRunnerInfo extends RunnerInfo {
  imageArn?: string;
  state?: MicrovmState;
}

export interface RunMicrovmRunnerInput {
  config: MicrovmProviderConfig;
  environment: string;
  runHookPayload: string;
  runnerOwner: string;
  runnerType: RunnerType;
  source: LambdaRunnerSource;
}

interface AwsErrorLike extends Error {
  cause?: unknown;
  code?: string;
  $fault?: 'client' | 'server';
  $metadata?: { httpStatusCode?: number };
}

const RETRYABLE_ERROR_NAMES = new Set([
  'ConflictException',
  'InternalServerException',
  'RequestTimeout',
  'RequestTimeoutException',
  'ResourceConflictException',
  'ServiceException',
  'ServiceQuotaExceededException',
  'Throttling',
  'ThrottlingException',
  'TooManyRequestsException',
]);

const RETRYABLE_NETWORK_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
]);

function microvmClient(): LambdaMicrovmsClient {
  return getTracedAWSV3Client(new LambdaMicrovmsClient({ region: process.env.AWS_REGION }));
}

export function microvmArn(imageArn: string, microvmId: string): string {
  const match = /^arn:([^:]+):lambda:([^:]+):([0-9]{12}):microvm-image:.+$/.exec(imageArn);
  if (!match) {
    throw new Error(`MICROVM_IMAGE_ARN is not a valid customer MicroVM image ARN: ${imageArn}`);
  }

  const [, partition, region, accountId] = match;
  return `arn:${partition}:lambda:${region}:${accountId}:microvm:${microvmId}`;
}

export async function runMicrovmRunner(input: RunMicrovmRunnerInput): Promise<string> {
  const commandInput: RunMicrovmCommandInput = {
    imageIdentifier: input.config.imageIdentifier,
    imageVersion: input.config.imageVersion,
    executionRoleArn: input.config.executionRoleArn,
    ingressNetworkConnectors: input.config.ingressNetworkConnectors,
    egressNetworkConnectors: input.config.egressNetworkConnectors,
    maximumDurationInSeconds: input.config.maximumDurationInSeconds,
    logging: input.config.logging,
    runHookPayload: input.runHookPayload,
    clientToken: randomUUID(),
  };

  logger.debug('Launching Lambda MicroVM runner', {
    imageIdentifier: commandInput.imageIdentifier,
    imageVersion: commandInput.imageVersion,
    maximumDurationInSeconds: commandInput.maximumDurationInSeconds,
  });

  const response = await microvmClient().send(new RunMicrovmCommand(commandInput));
  if (!response.microvmId) {
    throw new Error('RunMicrovm returned no microvmId');
  }

  try {
    await tagMicrovm(input.config.imageIdentifier, response.microvmId, {
      [APPLICATION_TAG]: APPLICATION_TAG_VALUE,
      'ghr:created_by': input.source,
      'ghr:environment': input.environment,
      'ghr:Owner': input.runnerOwner,
      'ghr:Type': input.runnerType,
    });
  } catch (error) {
    logger.error(`Failed to tag new MicroVM runner '${response.microvmId}', terminating it`, { error });
    await terminateMicrovm(response.microvmId).catch((terminationError) => {
      logger.error(`Failed to terminate untagged MicroVM runner '${response.microvmId}'`, {
        error: terminationError,
      });
    });
    throw error;
  }

  return response.microvmId;
}

export async function listMicrovmRunners(filters: ListRunnerFilters = {}): Promise<MicrovmRunnerInfo[]> {
  const client = microvmClient();
  const items: MicrovmItem[] = [];
  let nextToken: string | undefined;

  do {
    const response = await client.send(
      new ListMicrovmsCommand({
        maxResults: 50,
        nextToken,
      }),
    );
    items.push(...(response.items ?? []));
    nextToken = response.nextToken;
  } while (nextToken);

  const runners: MicrovmRunnerInfo[] = [];
  for (const item of items) {
    if (!item.microvmId || !item.imageArn || !item.state || !ACTIVE_STATES.has(item.state)) continue;

    let tags: Record<string, string>;
    try {
      tags =
        (await client.send(new ListTagsCommand({ Resource: microvmArn(item.imageArn, item.microvmId) }))).Tags ?? {};
    } catch (error) {
      if (error instanceof Error && error.name === 'ResourceNotFoundException') continue;
      throw error;
    }

    if (tags[APPLICATION_TAG] !== APPLICATION_TAG_VALUE) continue;
    if (filters.environment !== undefined && tags['ghr:environment'] !== filters.environment) continue;
    if (filters.runnerType !== undefined && tags['ghr:Type'] !== filters.runnerType) continue;
    if (filters.runnerOwner !== undefined && tags['ghr:Owner'] !== filters.runnerOwner) continue;
    if (filters.orphan && tags['ghr:orphan'] !== 'true') continue;

    runners.push({
      id: item.microvmId,
      imageArn: item.imageArn,
      launchTime: item.startedAt,
      owner: tags['ghr:Owner'],
      type: tags['ghr:Type'] as RunnerInfo['type'],
      orphan: tags['ghr:orphan'] === 'true',
      githubRunnerId: tags['ghr:github_runner_id'],
      bypassRemoval: tags['ghr:bypass-removal'] === 'true',
      state: item.state,
    });
  }

  return runners;
}

export async function tagMicrovm(imageArn: string, microvmId: string, tags: Record<string, string>): Promise<void> {
  await microvmClient().send(
    new TagResourceCommand({
      Resource: microvmArn(imageArn, microvmId),
      Tags: tags,
    }),
  );
}

export async function untagMicrovm(imageArn: string, microvmId: string, tagKeys: string[]): Promise<void> {
  await microvmClient().send(
    new UntagResourceCommand({
      Resource: microvmArn(imageArn, microvmId),
      TagKeys: tagKeys,
    }),
  );
}

export async function terminateMicrovm(microvmId: string): Promise<void> {
  await microvmClient().send(new TerminateMicrovmCommand({ microvmIdentifier: microvmId }));
}

export function microvmBootTimeExceeded(runner: { launchTime?: Date }): boolean {
  if (!runner.launchTime) return false;

  const bootTimeInMinutes = Number(process.env.RUNNER_BOOT_TIME_IN_MINUTES || '5');
  return runner.launchTime.getTime() + bootTimeInMinutes * 60_000 < Date.now();
}

export function isRetryableMicrovmError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const awsError = error as AwsErrorLike;
  if (RETRYABLE_ERROR_NAMES.has(awsError.name)) return true;

  const statusCode = awsError.$metadata?.httpStatusCode;
  if (
    awsError.$fault === 'server' ||
    statusCode === 429 ||
    (statusCode !== undefined && statusCode >= 500) ||
    (awsError.code !== undefined && RETRYABLE_NETWORK_ERROR_CODES.has(awsError.code))
  ) {
    return true;
  }

  return awsError.cause !== undefined && awsError.cause !== error ? isRetryableMicrovmError(awsError.cause) : false;
}
