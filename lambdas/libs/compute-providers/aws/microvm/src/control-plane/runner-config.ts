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
const MICROVM_METADATA_CONTEXT_TAG_KEYS = new Set([
  'Name',
  'ghr:environment',
  'ghr:runner_name_prefix',
  'ghr:ssm_config_path',
]);

export interface MicrovmRunHookPayloadV1 {
  runnerConfigSsmPath: string;
  runnerTokenSsmPath: string;
  version: 1;
}

export function createMicrovmRunHookPayload(paths: Omit<MicrovmRunHookPayloadV1, 'version'>): string {
  return JSON.stringify({
    version: 1,
    runnerConfigSsmPath: paths.runnerConfigSsmPath,
    runnerTokenSsmPath: paths.runnerTokenSsmPath,
  } satisfies MicrovmRunHookPayloadV1);
}

function createMicrovmMetadataTags(
  config: CreateGitHubRunnerConfig,
  environment: string,
): CreateGitHubRunnerConfig['ssmParameterStoreTags'] {
  return [
    ...config.ssmParameterStoreTags.filter((tag) => !MICROVM_METADATA_CONTEXT_TAG_KEYS.has(tag.Key)),
    { Key: 'ghr:environment', Value: environment },
    { Key: 'ghr:runner_name_prefix', Value: config.runnerNamePrefix },
    { Key: 'ghr:ssm_config_path', Value: config.ssmConfigPath },
  ];
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
  if (!githubRunnerConfig.ssmConfigPath?.trim()) {
    logger.error('Lambda MicroVM runners require SSM_CONFIG_PATH to locate runner metadata');
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
    runnerConfigSsmPath: githubRunnerConfig.ssmConfigPath,
    runnerTokenSsmPath: githubRunnerConfig.ssmTokenPath,
  });
  const environment = process.env.ENVIRONMENT;
  const metadataTags = createMicrovmMetadataTags(githubRunnerConfig, environment);

  for (let runnerIndex = 0; runnerIndex < numberOfRunners; runnerIndex++) {
    let microvmId: string | undefined;
    try {
      microvmId = await runMicrovmRunner({
        config,
        environment,
        runHookPayload,
        runnerOwner: githubRunnerConfig.runnerOwner,
        runnerType: githubRunnerConfig.runnerType,
        ssmParameterStoreTags: metadataTags,
        source,
      });

      const failedRunnerIds = await createStartRunnerConfig(githubRunnerConfig, [microvmId], githubInstallationClient, {
        getSsmParameterTags: (runnerId) => [{ Key: 'MicrovmId', Value: runnerId }],
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
