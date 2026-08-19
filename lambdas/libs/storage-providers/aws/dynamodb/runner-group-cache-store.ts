import { GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';

import type { RunnerGroupCacheRecord, RunnerGroupCacheStore } from '../../core';
import { getDynamoDbClient } from './client';
import { requiredEnvironmentValue } from './environment';

const ID_ATTRIBUTE = 'id';
const VALUE_ATTRIBUTE = 'value';
const RUNNER_GROUP_KEY = 'runner-group#';

interface AwsDynamoDbRunnerGroupCacheStoreConfig {
  tableName: string;
  configKeyPrefix: string;
}

export function createAwsDynamoDbRunnerGroupCacheStore(): RunnerGroupCacheStore {
  return new AwsDynamoDbRunnerGroupCacheStore({
    tableName: requiredEnvironmentValue('RUNNER_CONFIG_DYNAMODB_CONFIG_TABLE_NAME'),
    configKeyPrefix: requiredEnvironmentValue('RUNNER_CONFIG_DYNAMODB_CONFIG_KEY_PREFIX'),
  });
}

class AwsDynamoDbRunnerGroupCacheStore implements RunnerGroupCacheStore {
  constructor(private readonly config: AwsDynamoDbRunnerGroupCacheStoreConfig) {}

  async get(runnerGroupName: string): Promise<number | undefined> {
    const id = this.itemId(runnerGroupName);
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
      return undefined;
    }

    const value = result.Item[VALUE_ATTRIBUTE]?.S;
    if (value === undefined || !/^\d+$/.test(value)) {
      throw new Error(`Runner group cache item '${id}' has an invalid value`);
    }

    const runnerGroupId = Number(value);
    if (!Number.isSafeInteger(runnerGroupId)) {
      throw new Error(`Runner group cache item '${id}' has an invalid value`);
    }

    return runnerGroupId;
  }

  async create(record: RunnerGroupCacheRecord): Promise<void> {
    await getDynamoDbClient().send(
      new PutItemCommand({
        TableName: this.config.tableName,
        Item: {
          [ID_ATTRIBUTE]: { S: this.itemId(record.runnerGroupName) },
          [VALUE_ATTRIBUTE]: { S: record.runnerGroupId.toString() },
        },
        ConditionExpression: 'attribute_not_exists(#id)',
        ExpressionAttributeNames: {
          '#id': ID_ATTRIBUTE,
        },
      }),
    );
  }

  private itemId(runnerGroupName: string): string {
    return `${this.config.configKeyPrefix}${RUNNER_GROUP_KEY}${runnerGroupName}`;
  }
}
