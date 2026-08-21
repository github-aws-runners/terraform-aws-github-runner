import { randomUUID } from 'node:crypto';

import { createChildLogger, getTracedAWSV3Client } from '@aws-github-runner/aws-powertools-util';
import {
  LambdaMicrovmsClient,
  ListMicrovmsCommand,
  RunMicrovmCommand,
  TerminateMicrovmCommand,
} from '@aws-sdk/client-lambda-microvms';
import type { MicrovmItem, MicrovmState, RunMicrovmCommandInput } from '@aws-sdk/client-lambda-microvms';

import type {
  CreateGitHubRunnerConfig,
  LambdaRunnerSource,
  ListRunnerFilters,
  RunnerInfo,
  RunnerType,
} from '../../../../core';
import { loadMicrovmProviderConfig, type MicrovmProviderConfig } from './config';
import { MICROVM_LIFETIME_IN_SECONDS } from './lifetime';
import {
  assertValidMicrovmMetadataTags,
  createMicrovmRunnerMetadata,
  deleteMicrovmRunnerMetadata,
  listMicrovmRunnerMetadata,
  markMicrovmCleanupPending,
} from './runner-metadata';

const logger = createChildLogger('microvm-runners');

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
  ssmParameterStoreTags: CreateGitHubRunnerConfig['ssmParameterStoreTags'];
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
  'TooManyUpdates',
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

export async function runMicrovmRunner(input: RunMicrovmRunnerInput): Promise<string> {
  assertValidMicrovmMetadataTags({
    microvmId: 'microvm-validation',
    environment: input.environment,
    runnerOwner: input.runnerOwner,
    runnerType: input.runnerType,
    source: input.source,
    imageArn: input.config.imageIdentifier,
    imageVersion: input.config.imageVersion ?? 'version-validation',
    metadataTags: input.config.metadataTags,
    ssmParameterStoreTags: input.ssmParameterStoreTags,
  });

  const commandInput: RunMicrovmCommandInput = {
    imageIdentifier: input.config.imageIdentifier,
    imageVersion: input.config.imageVersion,
    executionRoleArn: input.config.executionRoleArn,
    ingressNetworkConnectors: input.config.ingressNetworkConnectors,
    egressNetworkConnectors: input.config.egressNetworkConnectors,
    maximumDurationInSeconds: MICROVM_LIFETIME_IN_SECONDS,
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

  const imageArn = response.imageArn ?? input.config.imageIdentifier;
  const imageVersion = response.imageVersion ?? input.config.imageVersion;

  try {
    await createMicrovmRunnerMetadata(input.config.metadataSsmPath, {
      microvmId: response.microvmId,
      environment: input.environment,
      runnerOwner: input.runnerOwner,
      runnerType: input.runnerType,
      source: input.source,
      imageArn,
      imageVersion,
      metadataTags: input.config.metadataTags,
      ssmParameterStoreTags: input.ssmParameterStoreTags,
    });
  } catch (error) {
    logger.error(`Failed to record metadata for new MicroVM runner '${response.microvmId}', terminating it`, {
      error,
    });
    await terminateMicrovm(response.microvmId, input.config.metadataSsmPath).catch((terminationError) => {
      logger.error(`Failed to terminate untracked MicroVM runner '${response.microvmId}'`, {
        error: terminationError,
      });
    });
    throw error;
  }

  return response.microvmId;
}

export async function listMicrovmRunners(
  filters: ListRunnerFilters = {},
  metadataSsmPath = loadMicrovmProviderConfig().metadataSsmPath,
): Promise<MicrovmRunnerInfo[]> {
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

  const activeItems = items.filter(
    (item): item is MicrovmItem & { imageArn: string; microvmId: string; state: MicrovmState } =>
      Boolean(item.microvmId && item.imageArn && item.state && ACTIVE_STATES.has(item.state)),
  );
  const microvmStates = new Map(
    items.flatMap((item) => (item.microvmId && item.state ? [[item.microvmId, item.state] as const] : [])),
  );
  const { cleanupMicrovmIds, metadataById } = await listMicrovmRunnerMetadata(metadataSsmPath, microvmStates);

  let cleanupError: unknown;
  for (const microvmId of cleanupMicrovmIds) {
    logger.warn(`Retrying cleanup of MicroVM runner '${microvmId}'`);
    try {
      await terminateMicrovm(microvmId, metadataSsmPath);
    } catch (error) {
      cleanupError ??= error;
      logger.error(`Failed to retry cleanup of MicroVM runner '${microvmId}'`, { error });
    }
  }
  if (cleanupError !== undefined) throw cleanupError;

  const runners: MicrovmRunnerInfo[] = [];
  for (const item of activeItems) {
    const metadata = metadataById.get(item.microvmId);
    if (!metadata) continue;
    if (metadata.imageArn !== item.imageArn) {
      throw new Error(`Active MicroVM runner '${item.microvmId}' has an image that does not match its metadata`);
    }

    const orphan = Boolean(metadata.orphan);
    if (filters.environment !== undefined && metadata.environment !== filters.environment) continue;
    if (filters.runnerType !== undefined && metadata.runnerType !== filters.runnerType) continue;
    if (filters.runnerOwner !== undefined && metadata.runnerOwner !== filters.runnerOwner) continue;
    if (filters.orphan && !orphan) continue;

    runners.push({
      id: item.microvmId,
      imageArn: item.imageArn,
      launchTime: item.startedAt,
      owner: metadata.runnerOwner,
      type: metadata.runnerType,
      orphan,
      githubRunnerId: metadata.githubRunnerId,
      bypassRemoval: metadata.bypassRemoval ?? false,
      state: item.state,
    });
  }

  return runners;
}

export async function terminateMicrovm(microvmId: string, metadataSsmPath: string): Promise<void> {
  try {
    await microvmClient().send(new TerminateMicrovmCommand({ microvmIdentifier: microvmId }));
  } catch (error) {
    if (error instanceof Error && error.name === 'ResourceNotFoundException') {
      await deleteMicrovmRunnerMetadata(metadataSsmPath, microvmId);
      return;
    }

    await markMicrovmCleanupPending(metadataSsmPath, microvmId).catch((metadataError) => {
      logger.error(`Failed to mark MicroVM runner '${microvmId}' for cleanup`, { error: metadataError });
    });
    throw error;
  }

  await markMicrovmCleanupPending(metadataSsmPath, microvmId);
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
