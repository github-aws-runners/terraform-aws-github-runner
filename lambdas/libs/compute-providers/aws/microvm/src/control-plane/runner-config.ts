import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import type { Octokit } from '@octokit/rest';

import type {
  CreateGitHubRunnerConfig,
  CreateRunnerResult,
  CreateStartRunnerConfig,
  LambdaRunnerSource,
} from '../../../../core';
import type { MicrovmDynamicLabelOverrides } from '../dynamic-labels';
import { loadMicrovmProviderConfig } from './config';
import { isRetryableMicrovmError, runMicrovmRunner, terminateMicrovm } from './microvms';
import { assertSeparatedMicrovmMetadataPath, setMicrovmGithubRunnerMetadata } from './runner-metadata';

const logger = createChildLogger('microvm-runner-config');

export interface MicrovmRunHookPayloadV1 {
  runnerConfigSsmArn: string;
  runnerTokenSsmPath: string;
  version: 1;
}

export function createMicrovmRunHookPayload(paths: Omit<MicrovmRunHookPayloadV1, 'version'>): string {
  return JSON.stringify({
    version: 1,
    runnerConfigSsmArn: paths.runnerConfigSsmArn,
    runnerTokenSsmPath: paths.runnerTokenSsmPath,
  } satisfies MicrovmRunHookPayloadV1);
}

export async function createMicrovmRunners(
  githubRunnerConfig: CreateGitHubRunnerConfig,
  numberOfRunners: number,
  githubInstallationClient: Octokit,
  createStartRunnerConfig: CreateStartRunnerConfig,
  source: LambdaRunnerSource,
  overrides: MicrovmDynamicLabelOverrides = {},
): Promise<CreateRunnerResult> {
  if (!githubRunnerConfig.ephemeral || !githubRunnerConfig.enableJitConfig) {
    logger.error('Lambda MicroVM runners require ephemeral runners with JIT configuration enabled');
    return { instances: [], retryableErrorCount: 0, nonRetryableErrorCount: numberOfRunners };
  }

  if (!githubRunnerConfig.ssmTokenPath?.trim()) {
    logger.error('Lambda MicroVM runners require SSM_TOKEN_PATH to deliver JIT configuration');
    return { instances: [], retryableErrorCount: 0, nonRetryableErrorCount: numberOfRunners };
  }
  let config;
  try {
    config = { ...loadMicrovmProviderConfig(), ...overrides };
    assertSeparatedMicrovmMetadataPath(config.metadataSsmPath, githubRunnerConfig.ssmTokenPath);
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
    runnerConfigSsmArn: config.runnerConfigSsmArn,
    runnerTokenSsmPath: githubRunnerConfig.ssmTokenPath,
  });

  for (let runnerIndex = 0; runnerIndex < numberOfRunners; runnerIndex++) {
    let microvmId: string | undefined;
    try {
      microvmId = await runMicrovmRunner({
        config,
        environment: process.env.ENVIRONMENT,
        runHookPayload,
        runnerOwner: githubRunnerConfig.runnerOwner,
        runnerType: githubRunnerConfig.runnerType,
        ssmParameterStoreTags: githubRunnerConfig.ssmParameterStoreTags,
        source,
      });

      const failedRunnerIds = await createStartRunnerConfig(githubRunnerConfig, [microvmId], githubInstallationClient, {
        getRunnerConfigMetadata: (runnerId) => [{ key: 'MicrovmId', value: runnerId }],
        onJitConfigCreated: async (runnerId, metadata) => {
          await setMicrovmGithubRunnerMetadata(config.metadataSsmPath, runnerId, metadata);
        },
      });

      if (failedRunnerIds.includes(microvmId)) {
        await terminateMicrovm(microvmId, config.metadataSsmPath).catch((terminationError) => {
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
        await terminateMicrovm(microvmId, config.metadataSsmPath).catch((terminationError) => {
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
