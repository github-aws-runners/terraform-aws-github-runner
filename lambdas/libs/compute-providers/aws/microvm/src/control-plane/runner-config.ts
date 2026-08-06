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
import { isRetryableMicrovmError, runMicrovmRunner, tagMicrovm, terminateMicrovm } from './microvms';

const logger = createChildLogger('microvm-runner-config');

export interface MicrovmRunHookPayloadV1 {
  runnerConfigSsmPath: string;
  version: 1;
}

export function createMicrovmRunHookPayload(ssmTokenPath: string): string {
  return JSON.stringify({
    version: 1,
    runnerConfigSsmPath: ssmTokenPath,
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
  } catch (error) {
    logger.error('Invalid Lambda MicroVM provider configuration', { error });
    return { instances: [], retryableErrorCount: 0, nonRetryableErrorCount: numberOfRunners };
  }

  const result: CreateRunnerResult = {
    instances: [],
    retryableErrorCount: 0,
    nonRetryableErrorCount: 0,
  };
  const runHookPayload = createMicrovmRunHookPayload(githubRunnerConfig.ssmTokenPath);

  for (let runnerIndex = 0; runnerIndex < numberOfRunners; runnerIndex++) {
    let microvmId: string | undefined;
    try {
      microvmId = await runMicrovmRunner({
        config,
        environment: process.env.ENVIRONMENT,
        runHookPayload,
        runnerOwner: githubRunnerConfig.runnerOwner,
        runnerType: githubRunnerConfig.runnerType,
        source,
      });

      const failedRunnerIds = await createStartRunnerConfig(githubRunnerConfig, [microvmId], githubInstallationClient, {
        getSsmParameterTags: (runnerId) => [{ Key: 'MicrovmId', Value: runnerId }],
        onJitConfigCreated: async (runnerId, metadata) => {
          await tagMicrovm(config.imageIdentifier, runnerId, {
            'ghr:github_runner_id': metadata.githubRunnerId,
          });
        },
      });

      if (failedRunnerIds.includes(microvmId)) {
        await terminateMicrovm(microvmId).catch((terminationError) => {
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
        await terminateMicrovm(microvmId).catch((terminationError) => {
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
