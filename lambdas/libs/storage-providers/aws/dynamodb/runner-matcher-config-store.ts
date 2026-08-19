import type { RunnerMatcherConfigStore } from '../../core';
import { getDurableConfigValue } from './durable-config';
import { requiredEnvironmentValue } from './environment';
import { RUNNER_MATCHER_CONFIG_ID, RUNNER_MATCHER_SCOPE } from './keys';

interface AwsDynamoDbRunnerMatcherConfigStoreConfig {
  tableName: string;
}

export function createAwsDynamoDbRunnerMatcherConfigStore(): RunnerMatcherConfigStore {
  return new AwsDynamoDbRunnerMatcherConfigStore({
    tableName: requiredEnvironmentValue('RUNNER_CONFIG_DYNAMODB_CONFIG_TABLE_NAME'),
  });
}

class AwsDynamoDbRunnerMatcherConfigStore implements RunnerMatcherConfigStore {
  constructor(private readonly config: AwsDynamoDbRunnerMatcherConfigStoreConfig) {}

  async get(): Promise<string> {
    return await getDurableConfigValue(
      this.config.tableName,
      RUNNER_MATCHER_SCOPE,
      RUNNER_MATCHER_CONFIG_ID,
      'Runner matcher config',
    );
  }
}
