import { GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';

import type { RunnerGroupCacheRecord, RunnerGroupCacheStore } from '../../core';
import { getDynamoDbClient } from './client';
import { requiredEnvironmentValue } from './environment';
import {
  ID_ATTRIBUTE,
  runnerGroupId as runnerGroupItemId,
  runnerGroupScope,
  SCOPE_ATTRIBUTE,
  VALUE_ATTRIBUTE,
} from './keys';

interface AwsDynamoDbRunnerGroupCacheStoreConfig {
  tableName: string;
  scope: string;
}

export function createAwsDynamoDbRunnerGroupCacheStore(): RunnerGroupCacheStore {
  return new AwsDynamoDbRunnerGroupCacheStore({
    tableName: requiredEnvironmentValue('RUNNER_CONFIG_DYNAMODB_CONFIG_TABLE_NAME'),
    scope: runnerGroupScope(requiredEnvironmentValue('RUNNER_CONFIG_DYNAMODB_ENTRY_ID')),
  });
}

class AwsDynamoDbRunnerGroupCacheStore implements RunnerGroupCacheStore {
  constructor(private readonly config: AwsDynamoDbRunnerGroupCacheStoreConfig) {}

  async get(runnerGroupName: string): Promise<number | undefined> {
    const id = runnerGroupItemId(runnerGroupName);
    const result = await getDynamoDbClient().send(
      new GetItemCommand({
        TableName: this.config.tableName,
        Key: {
          [SCOPE_ATTRIBUTE]: { S: this.config.scope },
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
      throw new Error(`Runner group cache item '${this.config.scope}/${id}' has an invalid value`);
    }

    const runnerGroupId = Number(value);
    if (!Number.isSafeInteger(runnerGroupId)) {
      throw new Error(`Runner group cache item '${this.config.scope}/${id}' has an invalid value`);
    }

    return runnerGroupId;
  }

  async create(record: RunnerGroupCacheRecord): Promise<void> {
    await getDynamoDbClient().send(
      new PutItemCommand({
        TableName: this.config.tableName,
        Item: {
          [SCOPE_ATTRIBUTE]: { S: this.config.scope },
          [ID_ATTRIBUTE]: { S: runnerGroupItemId(record.runnerGroupName) },
          [VALUE_ATTRIBUTE]: { S: record.runnerGroupId.toString() },
        },
        ConditionExpression: 'attribute_not_exists(#scope) AND attribute_not_exists(#id)',
        ExpressionAttributeNames: {
          '#scope': SCOPE_ATTRIBUTE,
          '#id': ID_ATTRIBUTE,
        },
      }),
    );
  }
}
