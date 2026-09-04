import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import type { Octokit } from '@octokit/rest';

import type {
  CreateGitHubRunnerConfig,
  CreateRunnerResult,
  CreateStartRunnerConfig,
  RunnerSource,
} from '../../../../core';
import type { MicrovmDynamicLabelOverrides } from '../dynamic-labels';
import { loadMicrovmProviderConfig } from './config';
import { isRetryableMicrovmError, runMicrovmRunner, terminateMicrovm } from './microvms';
import {
  assertMatchingMicrovmRunnerTokenPath,
  assertSeparatedMicrovmMetadataPath,
  normalizeMicrovmSsmPath,
  type MicrovmMetadataTag,
  setMicrovmGithubRunnerMetadata,
} from './runner-metadata';

const logger = createChildLogger('microvm-runner-config');
const MICROVM_METADATA_CONTEXT_TAG_KEYS = new Set([
  'Name',
  'ghr:environment',
  'ghr:runner_name_prefix',
  'ghr:ssm_config_path',
]);

export interface MicrovmRunHookPayloadV1 {
  imageArn?: string;
  imageVersion?: string;
  runnerConfigSsmPath: string;
  runnerTokenSsmPath: string;
  version: 1;
}

export function createMicrovmRunHookPayload(payload: Omit<MicrovmRunHookPayloadV1, 'version'>): string {
  const hasImageArn = payload.imageArn !== undefined;
  const hasImageVersion = payload.imageVersion !== undefined;
  if (hasImageArn !== hasImageVersion) {
    throw new Error('MicroVM hook payload image ARN and version must be provided together');
  }

  return JSON.stringify({
    version: 1,
    ...(hasImageArn
      ? {
          imageArn: payload.imageArn,
          imageVersion: payload.imageVersion,
        }
      : {}),
    runnerConfigSsmPath: payload.runnerConfigSsmPath,
    runnerTokenSsmPath: payload.runnerTokenSsmPath,
  } satisfies MicrovmRunHookPayloadV1);
}

function createMicrovmMetadataTags(
  config: CreateGitHubRunnerConfig,
  environment: string,
  ssmConfigPath: string,
  ssmParameterStoreTags: MicrovmMetadataTag[],
): MicrovmMetadataTag[] {
  return [
    ...ssmParameterStoreTags.filter((tag) => !MICROVM_METADATA_CONTEXT_TAG_KEYS.has(tag.Key)),
    { Key: 'ghr:environment', Value: environment },
    { Key: 'ghr:runner_name_prefix', Value: config.runnerNamePrefix },
    { Key: 'ghr:ssm_config_path', Value: ssmConfigPath },
  ];
}

function loadSsmParameterStoreTags(): MicrovmMetadataTag[] {
  const encodedTags = process.env.SSM_PARAMETER_STORE_TAGS;
  if (encodedTags === undefined || encodedTags.trim() === '') {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(encodedTags);
    if (!Array.isArray(parsed)) {
      throw new Error('tags must be an array');
    }

    return parsed.map((tag, index) => {
      if (
        tag === null ||
        typeof tag !== 'object' ||
        typeof (tag as Record<string, unknown>).Key !== 'string' ||
        typeof (tag as Record<string, unknown>).Value !== 'string'
      ) {
        throw new Error(`tag at index ${index} is invalid`);
      }
      const candidate = tag as Record<string, unknown>;
      return { Key: candidate.Key as string, Value: candidate.Value as string };
    });
  } catch (error) {
    throw new Error(`Failed to parse SSM_PARAMETER_STORE_TAGS: ${(error as Error).message}`);
  }
}

export async function createMicrovmRunners(
  githubRunnerConfig: CreateGitHubRunnerConfig,
  numberOfRunners: number,
  githubInstallationClient: Octokit,
  createStartRunnerConfig: CreateStartRunnerConfig,
  source: RunnerSource,
  overrides: MicrovmDynamicLabelOverrides = {},
): Promise<CreateRunnerResult> {
  if (!githubRunnerConfig.ephemeral || !githubRunnerConfig.enableJitConfig) {
    logger.error('Lambda MicroVM runners require ephemeral runners with JIT configuration enabled');
    return { instances: [], retryableErrorCount: 0, nonRetryableErrorCount: numberOfRunners };
  }

  if (!process.env.SSM_TOKEN_PATH?.trim()) {
    logger.error('Lambda MicroVM runners require SSM_TOKEN_PATH to deliver JIT configuration');
    return { instances: [], retryableErrorCount: 0, nonRetryableErrorCount: numberOfRunners };
  }
  if (!process.env.SSM_CONFIG_PATH?.trim()) {
    logger.error('Lambda MicroVM runners require SSM_CONFIG_PATH to locate runner metadata');
    return { instances: [], retryableErrorCount: 0, nonRetryableErrorCount: numberOfRunners };
  }
  let config;
  let normalizedRunnerConfigPath: string;
  let normalizedRunnerTokenPath: string;
  let ssmParameterStoreTags: MicrovmMetadataTag[];
  try {
    config = { ...loadMicrovmProviderConfig(), ...overrides };
    normalizedRunnerConfigPath = normalizeMicrovmSsmPath(process.env.SSM_CONFIG_PATH);
    normalizedRunnerTokenPath = normalizeMicrovmSsmPath(process.env.SSM_TOKEN_PATH);
    assertMatchingMicrovmRunnerTokenPath(config.runnerTokenSsmPath, normalizedRunnerTokenPath);
    assertSeparatedMicrovmMetadataPath(config.metadataSsmPath, config.runnerTokenSsmPath);
    ssmParameterStoreTags = loadSsmParameterStoreTags();
  } catch (error) {
    logger.error('Invalid Lambda MicroVM provider configuration', { error });
    return { instances: [], retryableErrorCount: 0, nonRetryableErrorCount: numberOfRunners };
  }

  const result: CreateRunnerResult = {
    instances: [],
    retryableErrorCount: 0,
    nonRetryableErrorCount: 0,
  };
  const runHookPayload = createMicrovmRunHookPayload({
    ...(config.imageVersion !== undefined
      ? {
          imageArn: config.imageIdentifier,
          imageVersion: config.imageVersion,
        }
      : {}),
    runnerConfigSsmPath: normalizedRunnerConfigPath,
    runnerTokenSsmPath: normalizedRunnerTokenPath,
  });
  const environment = process.env.ENVIRONMENT;
  const metadataTags = createMicrovmMetadataTags(
    githubRunnerConfig,
    environment,
    normalizedRunnerConfigPath,
    ssmParameterStoreTags,
  );

  for (let runnerIndex = 0; runnerIndex < numberOfRunners; runnerIndex++) {
    let microvmId: string | undefined;
    try {
      const runner = await runMicrovmRunner({
        config,
        environment,
        runHookPayload,
        runnerOwner: githubRunnerConfig.runnerOwner,
        runnerType: githubRunnerConfig.runnerType,
        ssmParameterStoreTags: metadataTags,
        source,
      });
      microvmId = runner.microvmId;

      const failedRunnerIds = await createStartRunnerConfig(githubRunnerConfig, [microvmId], githubInstallationClient, {
        getRunnerConfigMetadata: (runnerId) => [{ key: 'MicrovmId', value: runnerId }],
        onJitConfigCreated: async (runnerId, metadata) => {
          await setMicrovmGithubRunnerMetadata(config, runnerId, metadata, runner.metadataTags);
        },
      });

      if (failedRunnerIds.includes(microvmId)) {
        await terminateMicrovm(microvmId, config).catch((terminationError) => {
          logger.error(`Failed to terminate MicroVM runner '${microvmId}' after JIT configuration failed`, {
            error: terminationError,
          });
        });
        result.retryableErrorCount++;
      } else {
        result.instances.push(microvmId);
      }
    } catch (error) {
      if (microvmId) {
        await terminateMicrovm(microvmId, config).catch((terminationError) => {
          logger.error(`Failed to terminate MicroVM runner '${microvmId}' after setup failed`, {
            error: terminationError,
          });
        });
      }

      const retryable = isRetryableMicrovmError(error);
      logger.error('Failed to create Lambda MicroVM runner', { error, retryable });
      if (retryable) result.retryableErrorCount++;
      else result.nonRetryableErrorCount++;
    }
  }

  return result;
}
