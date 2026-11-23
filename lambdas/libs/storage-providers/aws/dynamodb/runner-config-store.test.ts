import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDynamoDbClient } from './client';
import { createAwsDynamoDbRunnerConfigStore } from './runner-config-store';

const mockDynamoDbClient = mockClient(DynamoDBClient);
const cleanEnv = process.env;

describe('aws_dynamodb runner config store', () => {
  beforeEach(() => {
    mockDynamoDbClient.reset();
    resetDynamoDbClient();
    process.env = { ...cleanEnv };
    process.env.AWS_REGION = 'eu-west-1';
    process.env.RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME = 'runner-state';
    delete process.env.RUNNER_CONFIG_DYNAMODB_ENTRY_ID;
    process.env.RUNNER_CONFIG_DYNAMODB_TTL_SECONDS = '3600';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates an expiring runner config without overwriting an existing record', async () => {
    const store = createAwsDynamoDbRunnerConfigStore();

    await store.create({
      runnerId: 'runner-123',
      value: 'encoded-jit-config',
      accessScope: 'arn:aws:ec2:eu-west-1:123456789012:instance/i-123',
    });

    expect(store.maxWritesPerSecond).toBeUndefined();
    expect(mockDynamoDbClient).toHaveReceivedCommandWith(PutItemCommand, {
      TableName: 'runner-state',
      Item: {
        scope: { S: 'arn:aws:ec2:eu-west-1:123456789012:instance/i-123' },
        id: { S: 'config' },
        value: { S: 'encoded-jit-config' },
        expires_at: { N: '1735693200' },
      },
      ConditionExpression: 'attribute_not_exists(#scope) AND attribute_not_exists(#id)',
      ExpressionAttributeNames: {
        '#scope': 'scope',
        '#id': 'id',
      },
    });
  });

  it('stores provider-neutral metadata without exposing it as top-level attributes', async () => {
    const store = createAwsDynamoDbRunnerConfigStore();

    await store.create(
      {
        runnerId: 'runner-123',
        value: 'registration-config',
        accessScope: 'arn:aws:ec2:eu-west-1:123456789012:instance/i-123',
      },
      {
        metadata: [
          { key: 'InstanceId', value: 'i-123' },
          { key: 'Environment', value: 'test' },
        ],
      },
    );

    const command = mockDynamoDbClient.commandCalls(PutItemCommand)[0].args[0];
    expect(command.input.Item?.metadata).toEqual({
      L: [
        { M: { key: { S: 'InstanceId' }, value: { S: 'i-123' } } },
        { M: { key: { S: 'Environment' }, value: { S: 'test' } } },
      ],
    });
  });

  it('does not write metadata for an empty metadata list', async () => {
    const store = createAwsDynamoDbRunnerConfigStore();

    await store.create(
      {
        runnerId: 'runner-123',
        value: 'registration-config',
        accessScope: 'arn:aws:ec2:eu-west-1:123456789012:instance/i-123',
      },
      { metadata: [] },
    );

    const command = mockDynamoDbClient.commandCalls(PutItemCommand)[0].args[0];
    expect(command.input.Item).not.toHaveProperty('metadata');
  });

  it('relies on DynamoDB TTL instead of scanning or deleting during housekeeping', async () => {
    const store = createAwsDynamoDbRunnerConfigStore();

    await expect(store.houseKeeper()).resolves.toBeUndefined();

    expect(mockDynamoDbClient.calls()).toHaveLength(0);
  });

  it.each(['RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME', 'RUNNER_CONFIG_DYNAMODB_TTL_SECONDS'] as const)(
    'rejects a missing or blank %s',
    (name) => {
      delete process.env[name];
      expect(() => createAwsDynamoDbRunnerConfigStore()).toThrow(`Environment variable ${name} is not set`);

      process.env[name] = '   ';
      expect(() => createAwsDynamoDbRunnerConfigStore()).toThrow(`Environment variable ${name} is not set`);
      expect(mockDynamoDbClient.calls()).toHaveLength(0);
    },
  );

  it.each(['0', '-1', '1.5', 'not-a-number', '9007199254740992'])('rejects invalid TTL seconds %j', (ttlSeconds) => {
    process.env.RUNNER_CONFIG_DYNAMODB_TTL_SECONDS = ttlSeconds;

    expect(() => createAwsDynamoDbRunnerConfigStore()).toThrow(
      'Environment variable RUNNER_CONFIG_DYNAMODB_TTL_SECONDS must be a positive integer',
    );
    expect(mockDynamoDbClient.calls()).toHaveLength(0);
  });

  it.each([undefined, '', '   '])('rejects invalid access scope %j before writing', async (accessScope) => {
    const store = createAwsDynamoDbRunnerConfigStore();

    await expect(store.create({ runnerId: 'runner-123', value: 'sensitive-config', accessScope })).rejects.toThrow(
      "Runner config field 'accessScope' must be a non-empty string for aws_dynamodb",
    );
    expect(mockDynamoDbClient.calls()).toHaveLength(0);
  });

  it('propagates DynamoDB write errors without handling the stored value', async () => {
    const error = new Error('conditional request failed');
    mockDynamoDbClient.on(PutItemCommand).rejects(error);
    const store = createAwsDynamoDbRunnerConfigStore();

    await expect(
      store.create({
        runnerId: 'runner-123',
        value: 'sensitive-config',
        accessScope: 'arn:aws:ec2:eu-west-1:123456789012:instance/i-123',
      }),
    ).rejects.toBe(error);
  });
});
