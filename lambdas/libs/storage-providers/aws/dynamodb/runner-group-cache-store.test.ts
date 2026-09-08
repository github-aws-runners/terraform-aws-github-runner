import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';
import { beforeEach, describe, expect, it } from 'vitest';

import { resetDynamoDbClient } from './client';
import { createAwsDynamoDbRunnerGroupCacheStore } from './runner-group-cache-store';

const mockDynamoDbClient = mockClient(DynamoDBClient);
const cleanEnv = process.env;

describe('aws_dynamodb runner group cache store', () => {
  beforeEach(() => {
    mockDynamoDbClient.reset();
    resetDynamoDbClient();
    process.env = { ...cleanEnv };
    process.env.AWS_REGION = 'eu-west-1';
    process.env.RUNNER_CONFIG_DYNAMODB_CONFIG_TABLE_NAME = 'runner-configuration';
    process.env.RUNNER_CONFIG_DYNAMODB_ENTRY_ID = 'linux-x64';
  });

  it('gets a runner group id with a strongly consistent projected read', async () => {
    mockDynamoDbClient.on(GetItemCommand).resolves({ Item: { value: { S: '42' } } });
    const store = createAwsDynamoDbRunnerGroupCacheStore();

    await expect(store.get('Default')).resolves.toBe(42);
    expect(mockDynamoDbClient).toHaveReceivedCommandWith(GetItemCommand, {
      TableName: 'runner-configuration',
      Key: {
        scope: { S: 'entry#linux-x64#runner-group' },
        id: { S: 'runner-group#Default' },
      },
      ConsistentRead: true,
      ProjectionExpression: '#value',
      ExpressionAttributeNames: {
        '#value': 'value',
      },
    });
  });

  it('returns undefined when the runner group is not cached', async () => {
    mockDynamoDbClient.on(GetItemCommand).resolves({});
    const store = createAwsDynamoDbRunnerGroupCacheStore();

    await expect(store.get('Default')).resolves.toBeUndefined();
  });

  it.each([
    [{ value: { N: '42' } }, 'non-string value'],
    [{ value: { S: '42cached' } }, 'partially numeric value'],
    [{ value: { S: '9007199254740992' } }, 'unsafe integer value'],
  ])('rejects an invalid cached runner group id: %s', async (item) => {
    mockDynamoDbClient.on(GetItemCommand).resolves({ Item: item });
    const store = createAwsDynamoDbRunnerGroupCacheStore();

    await expect(store.get('Default')).rejects.toThrow(
      "Runner group cache item 'entry#linux-x64#runner-group/runner-group#Default' has an invalid value",
    );
  });

  it('creates a runner group cache record without overwriting an existing record', async () => {
    const store = createAwsDynamoDbRunnerGroupCacheStore();

    await store.create({ runnerGroupName: 'Default', runnerGroupId: 42 });

    expect(mockDynamoDbClient).toHaveReceivedCommandWith(PutItemCommand, {
      TableName: 'runner-configuration',
      Item: {
        scope: { S: 'entry#linux-x64#runner-group' },
        id: { S: 'runner-group#Default' },
        value: { S: '42' },
      },
      ConditionExpression: 'attribute_not_exists(#scope) AND attribute_not_exists(#id)',
      ExpressionAttributeNames: {
        '#scope': 'scope',
        '#id': 'id',
      },
    });
  });

  it.each(['RUNNER_CONFIG_DYNAMODB_CONFIG_TABLE_NAME', 'RUNNER_CONFIG_DYNAMODB_ENTRY_ID'] as const)(
    'rejects a missing or blank %s',
    (name) => {
      delete process.env[name];
      expect(() => createAwsDynamoDbRunnerGroupCacheStore()).toThrow(`Environment variable ${name} is not set`);

      process.env[name] = '   ';
      expect(() => createAwsDynamoDbRunnerGroupCacheStore()).toThrow(`Environment variable ${name} is not set`);
      expect(mockDynamoDbClient.calls()).toHaveLength(0);
    },
  );

  it('propagates DynamoDB read errors', async () => {
    const error = new Error('read failed');
    mockDynamoDbClient.on(GetItemCommand).rejects(error);
    const store = createAwsDynamoDbRunnerGroupCacheStore();

    await expect(store.get('Default')).rejects.toBe(error);
  });

  it('propagates DynamoDB write errors', async () => {
    const error = new Error('conditional request failed');
    mockDynamoDbClient.on(PutItemCommand).rejects(error);
    const store = createAwsDynamoDbRunnerGroupCacheStore();

    await expect(store.create({ runnerGroupName: 'Default', runnerGroupId: 42 })).rejects.toBe(error);
  });
});
