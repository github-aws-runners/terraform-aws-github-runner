import { GetItemCommand } from '@aws-sdk/client-dynamodb';

import type { RunnerMatcherConfigStore } from '../../core';
import { getDynamoDbClient } from './client';
import { requiredEnvironmentValue } from './environment';

const ID_ATTRIBUTE = 'id';
const VALUE_ATTRIBUTE = 'value';
const RUNNER_MATCHER_CONFIG_KEY = 'runner-matcher-config';

interface AwsDynamoDbRunnerMatcherConfigStoreConfig {
  tableName: string;
  configKeyPrefix: string;
}

export function createAwsDynamoDbRunnerMatcherConfigStore(): RunnerMatcherConfigStore {
  return new AwsDynamoDbRunnerMatcherConfigStore({
    tableName: requiredEnvironmentValue('RUNNER_CONFIG_DYNAMODB_CONFIG_TABLE_NAME'),
    configKeyPrefix: requiredEnvironmentValue('RUNNER_CONFIG_DYNAMODB_CONFIG_KEY_PREFIX'),
  });
}

class AwsDynamoDbRunnerMatcherConfigStore implements RunnerMatcherConfigStore {
  constructor(private readonly config: AwsDynamoDbRunnerMatcherConfigStoreConfig) {}

  async get(): Promise<string> {
    const id = `${this.config.configKeyPrefix}${RUNNER_MATCHER_CONFIG_KEY}`;
    const result = await getDynamoDbClient().send(
      new GetItemCommand({
        TableName: this.config.tableName,
        Key: {
          [ID_ATTRIBUTE]: { S: id },
        },
        ConsistentRead: true,
        ProjectionExpression: '#value',
        ExpressionAttributeNames: {
          '#value': VALUE_ATTRIBUTE,
        },
      }),
    );

    if (!result.Item) {
      throw new Error(`Runner matcher config item '${id}' was not found`);
    }

    const value = result.Item[VALUE_ATTRIBUTE]?.S;
    if (value === undefined) {
      throw new Error(`Runner matcher config item '${id}' does not contain a string value`);
    }

    return value;
  }
}
