import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';
import { beforeEach, describe, expect, it } from 'vitest';

import { resetDynamoDbClient } from './client';
import { createAwsDynamoDbRunnerMatcherConfigStore } from './runner-matcher-config-store';

const mockDynamoDbClient = mockClient(DynamoDBClient);
const cleanEnv = process.env;

describe('aws_dynamodb runner matcher config store', () => {
  beforeEach(() => {
    mockDynamoDbClient.reset();
    resetDynamoDbClient();
    process.env = { ...cleanEnv };
    process.env.AWS_REGION = 'eu-west-1';
    process.env.RUNNER_CONFIG_DYNAMODB_CONFIG_TABLE_NAME = 'runner-configuration';
    process.env.RUNNER_CONFIG_DYNAMODB_CONFIG_KEY_PREFIX = 'config#';
  });

  it('gets the matcher config with a strongly consistent projected read', async () => {
    mockDynamoDbClient.on(GetItemCommand).resolves({ Item: { value: { S: '[{"id":"runner"}]' } } });
    const store = createAwsDynamoDbRunnerMatcherConfigStore();

    await expect(store.get()).resolves.toBe('[{"id":"runner"}]');
    expect(mockDynamoDbClient).toHaveReceivedCommandWith(GetItemCommand, {
      TableName: 'runner-configuration',
      Key: {
        id: { S: 'config#runner-matcher-config' },
      },
      ConsistentRead: true,
      ProjectionExpression: '#value',
      ExpressionAttributeNames: {
        '#value': 'value',
      },
    });
  });

  it('returns an empty stored string for validation by the webhook config loader', async () => {
    mockDynamoDbClient.on(GetItemCommand).resolves({ Item: { value: { S: '' } } });
    const store = createAwsDynamoDbRunnerMatcherConfigStore();

    await expect(store.get()).resolves.toBe('');
  });

  it('rejects a missing matcher config item', async () => {
    mockDynamoDbClient.on(GetItemCommand).resolves({});
    const store = createAwsDynamoDbRunnerMatcherConfigStore();

    await expect(store.get()).rejects.toThrow(
      "Runner matcher config item 'config#runner-matcher-config' was not found",
    );
  });

  it('rejects a matcher config item without a string value', async () => {
    mockDynamoDbClient.on(GetItemCommand).resolves({ Item: { value: { N: '1' } } });
    const store = createAwsDynamoDbRunnerMatcherConfigStore();

    await expect(store.get()).rejects.toThrow(
      "Runner matcher config item 'config#runner-matcher-config' does not contain a string value",
    );
  });

  it.each(['RUNNER_CONFIG_DYNAMODB_CONFIG_TABLE_NAME', 'RUNNER_CONFIG_DYNAMODB_CONFIG_KEY_PREFIX'] as const)(
    'rejects a missing or blank %s',
    (name) => {
      delete process.env[name];
      expect(() => createAwsDynamoDbRunnerMatcherConfigStore()).toThrow(`Environment variable ${name} is not set`);

      process.env[name] = '   ';
      expect(() => createAwsDynamoDbRunnerMatcherConfigStore()).toThrow(`Environment variable ${name} is not set`);
      expect(mockDynamoDbClient.calls()).toHaveLength(0);
    },
  );

  it('propagates DynamoDB read errors', async () => {
    const error = new Error('read failed');
    mockDynamoDbClient.on(GetItemCommand).rejects(error);
    const store = createAwsDynamoDbRunnerMatcherConfigStore();

    await expect(store.get()).rejects.toBe(error);
  });

  it('reuses the memoised client across reads', async () => {
    mockDynamoDbClient.on(GetItemCommand).resolves({ Item: { value: { S: '[]' } } });
    const store = createAwsDynamoDbRunnerMatcherConfigStore();

    await store.get();
    await store.get();

    expect(mockDynamoDbClient.commandCalls(GetItemCommand)).toHaveLength(2);
  });
});
