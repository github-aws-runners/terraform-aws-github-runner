import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { createAwsSsmGitHubAppCredentialsStore } from './aws/ssm/github-app-credentials-store';
import { createAwsSsmRunnerConfigConsumer } from './aws/ssm/runner-config-consumer';
import { createAwsSsmRunnerConfigStore } from './aws/ssm/runner-config-store';
import { createAwsSsmRunnerGroupCacheStore } from './aws/ssm/runner-group-cache-store';
import type { CommonStorage, StorageProviders } from './core';
import { loadRunnerConfigConsumerConfigFromEnvironment } from './runner-config-consumer';
import { loadSsmParameterStoreTagsFromEnvironment } from './aws/ssm/parameter-store-tags';
import { resolveRunnerConfigStorageProvider, runnerConfigStorageProvider } from './provider';

type Environment = Readonly<Record<string, string | undefined>>;

const logger = createChildLogger('storage-providers');

export function createStorageProviders(environment: Environment = process.env): StorageProviders {
  const provider = resolveRunnerConfigStorageProvider(environment.RUNNER_CONFIG_STORAGE_PROVIDER);
  if (provider !== runnerConfigStorageProvider.awsSsm) {
    throw new Error(`Unsupported runner config storage provider '${provider}'`);
  }

  const tokenPath = required(environment.SSM_TOKEN_PATH, 'SSM_TOKEN_PATH');
  const configPath = required(environment.SSM_CONFIG_PATH, 'SSM_CONFIG_PATH');
  const parameterStoreTags = loadSsmParameterStoreTagsFromEnvironment(environment);
  const consumerConfig = loadRunnerConfigConsumerConfigFromEnvironment(environment);

  logger.info('Composing runner configuration storage providers', {
    storageProvider: provider,
    capabilities: ['runnerConfig', 'runnerGroupCache', 'consumer', 'githubAppCredentials'],
  });

  return {
    runnerConfig: createAwsSsmRunnerConfigStore({ tokenPath, parameterStoreTags }),
    runnerGroupCache: createAwsSsmRunnerGroupCacheStore({ configPath, parameterStoreTags }),
    consumer: createAwsSsmRunnerConfigConsumer({ SSM_TOKEN_PATH: tokenPath }, consumerConfig),
    ...createCommonStorage(environment),
  };
}

export function createCommonStorage(environment: Environment = process.env): CommonStorage {
  const store = createAwsSsmGitHubAppCredentialsStore(environment);
  let credentials: ReturnType<typeof store.get> | undefined;

  return {
    githubAppCredentials: {
      get: () => (credentials ??= store.get()),
    },
  };
}

function required(value: string | undefined, name: string): string {
  if (!value || value.trim() === '') {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
}
