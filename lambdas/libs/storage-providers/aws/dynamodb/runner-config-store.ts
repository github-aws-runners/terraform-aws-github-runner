import { PutItemCommand, type AttributeValue } from '@aws-sdk/client-dynamodb';

import type { RunnerConfigMetadata, RunnerConfigRecord, RunnerConfigStore } from '../../core';
import { getDynamoDbClient } from './client';
import { positiveIntegerEnvironmentValue, requiredEnvironmentValue } from './environment';

const ID_ATTRIBUTE = 'id';
const VALUE_ATTRIBUTE = 'value';
const EXPIRES_AT_ATTRIBUTE = 'expires_at';
const METADATA_ATTRIBUTE = 'metadata';

interface AwsDynamoDbRunnerConfigStoreConfig {
  tableName: string;
  tokenKeyPrefix: string;
  ttlSeconds: number;
}

export function createAwsDynamoDbRunnerConfigStore(): RunnerConfigStore {
  return new AwsDynamoDbRunnerConfigStore({
    tableName: requiredEnvironmentValue('RUNNER_CONFIG_DYNAMODB_TABLE_NAME'),
    tokenKeyPrefix: requiredEnvironmentValue('RUNNER_CONFIG_DYNAMODB_TOKEN_KEY_PREFIX'),
    ttlSeconds: positiveIntegerEnvironmentValue('RUNNER_CONFIG_DYNAMODB_TTL_SECONDS'),
  });
}

class AwsDynamoDbRunnerConfigStore implements RunnerConfigStore {
  constructor(private readonly config: AwsDynamoDbRunnerConfigStoreConfig) {}

  async create(record: RunnerConfigRecord, options: { metadata?: RunnerConfigMetadata[] } = {}): Promise<void> {
    const item: Record<string, AttributeValue> = {
      [ID_ATTRIBUTE]: { S: `${this.config.tokenKeyPrefix}${record.runnerId}` },
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
        ConditionExpression: 'attribute_not_exists(#id)',
        ExpressionAttributeNames: {
          '#id': ID_ATTRIBUTE,
        },
      }),
    );
  }

  async houseKeeper(): Promise<void> {
    // DynamoDB TTL removes expired runner config records without a scan/delete job.
  }
}
