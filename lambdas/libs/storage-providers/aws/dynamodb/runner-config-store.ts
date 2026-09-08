import { PutItemCommand, type AttributeValue } from '@aws-sdk/client-dynamodb';

import type { RunnerConfigMetadata, RunnerConfigRecord, RunnerConfigStore } from '../../core';
import { getDynamoDbClient } from './client';
import { positiveIntegerEnvironmentValue, requiredEnvironmentValue } from './environment';
import { EXPIRES_AT_ATTRIBUTE, ID_ATTRIBUTE, RUNNER_CONFIG_ID, SCOPE_ATTRIBUTE, VALUE_ATTRIBUTE } from './keys';

const METADATA_ATTRIBUTE = 'metadata';

interface AwsDynamoDbRunnerConfigStoreConfig {
  tableName: string;
  ttlSeconds: number;
}

export function createAwsDynamoDbRunnerConfigStore(): RunnerConfigStore {
  return new AwsDynamoDbRunnerConfigStore({
    tableName: requiredEnvironmentValue('RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME'),
    ttlSeconds: positiveIntegerEnvironmentValue('RUNNER_CONFIG_DYNAMODB_TTL_SECONDS'),
  });
}

class AwsDynamoDbRunnerConfigStore implements RunnerConfigStore {
  constructor(private readonly config: AwsDynamoDbRunnerConfigStoreConfig) {}

  async create(record: RunnerConfigRecord, options: { metadata?: RunnerConfigMetadata[] } = {}): Promise<void> {
    if (typeof record.accessScope !== 'string' || record.accessScope.trim() === '') {
      throw new Error("Runner config field 'accessScope' must be a non-empty string for aws_dynamodb");
    }

    const item: Record<string, AttributeValue> = {
      [SCOPE_ATTRIBUTE]: { S: record.accessScope },
      [ID_ATTRIBUTE]: { S: RUNNER_CONFIG_ID },
      [VALUE_ATTRIBUTE]: { S: record.value },
      [EXPIRES_AT_ATTRIBUTE]: {
        N: (Math.floor(Date.now() / 1000) + this.config.ttlSeconds).toString(),
      },
    };

    if (options.metadata && options.metadata.length > 0) {
      item[METADATA_ATTRIBUTE] = {
        L: options.metadata.map(({ key, value }) => ({
          M: {
            key: { S: key },
            value: { S: value },
          },
        })),
      };
    }

    await getDynamoDbClient().send(
      new PutItemCommand({
        TableName: this.config.tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(#scope) AND attribute_not_exists(#id)',
        ExpressionAttributeNames: {
          '#scope': SCOPE_ATTRIBUTE,
          '#id': ID_ATTRIBUTE,
        },
      }),
    );
  }

  async houseKeeper(): Promise<void> {
    // DynamoDB TTL removes expired runner config records without a scan/delete job.
  }
}
