import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRunnerConfigStore, loadRunnerConfigStorageFromEnv, resetDynamoDbClient } from './runner-config-storage';
import type { CreateGitHubRunnerConfig } from './types';

const mockDynamoDbClient = mockClient(DynamoDBClient);
const cleanEnv = process.env;

const BASE_CONFIG: CreateGitHubRunnerConfig = {
  ephemeral: true,
  enableJitConfig: true,
  runnerLabels: 'self-hosted,linux,x64',
  runnerGroup: 'Default',
  runnerNamePrefix: 'unit-test-',
  runnerOwner: 'Codertocat',
  runnerType: 'Org',
  disableAutoUpdate: false,
  ssmTokenPath: '/github-action-runners/default/runners/tokens',
  ssmConfigPath: '/github-action-runners/default/runners/config',
  ssmParameterStoreTags: [],
};

beforeEach(() => {
  process.env = { ...cleanEnv, AWS_REGION: 'us-east-1' };
  mockDynamoDbClient.reset();
  resetDynamoDbClient();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-10T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  process.env = cleanEnv;
});

describe('loadRunnerConfigStorageFromEnv', () => {
  it('defaults to SSM storage', () => {
    delete process.env.RUNNER_CONFIG_STORAGE_BACKEND;

    expect(loadRunnerConfigStorageFromEnv()).toEqual({ backend: 'ssm' });
  });

  it('loads DynamoDB storage config', () => {
    process.env.RUNNER_CONFIG_STORAGE_BACKEND = 'dynamodb';
    process.env.RUNNER_CONFIG_DYNAMODB_TABLE_NAME = 'runner-config-table';
    process.env.RUNNER_CONFIG_DYNAMODB_TOKEN_KEY_PREFIX = 'arn:aws:ec2:us-east-1:123456789012:instance/';
    process.env.RUNNER_CONFIG_DYNAMODB_TTL_SECONDS = '60';

    expect(loadRunnerConfigStorageFromEnv()).toEqual({
      backend: 'dynamodb',
      dynamodb: {
        tableName: 'runner-config-table',
        partitionKeyName: 'id',
        valueAttributeName: 'value',
        configKeyPrefix: 'config#',
        consistentRead: true,
        tokenOverwriteProtectionEnabled: true,
        tokenKeyPrefix: 'arn:aws:ec2:us-east-1:123456789012:instance/',
        tokenTtlSeconds: 60,
        ttlAttributeName: 'expires_at',
      },
    });
  });

  it('loads custom DynamoDB storage schema config', () => {
    process.env.RUNNER_CONFIG_STORAGE_BACKEND = 'dynamodb';
    process.env.RUNNER_CONFIG_DYNAMODB_TABLE_NAME = 'runner-config-table';
    process.env.RUNNER_CONFIG_DYNAMODB_PARTITION_KEY_NAME = 'pk';
    process.env.RUNNER_CONFIG_DYNAMODB_VALUE_ATTRIBUTE_NAME = 'payload';
    process.env.RUNNER_CONFIG_DYNAMODB_CONFIG_KEY_PREFIX = 'cfg#';
    process.env.RUNNER_CONFIG_DYNAMODB_CONSISTENT_READ = 'false';
    process.env.RUNNER_CONFIG_DYNAMODB_TOKEN_OVERWRITE_PROTECTION_ENABLED = 'false';
    process.env.RUNNER_CONFIG_DYNAMODB_TOKEN_KEY_PREFIX = 'token#';
    process.env.RUNNER_CONFIG_DYNAMODB_TTL_SECONDS = '60';
    process.env.RUNNER_CONFIG_DYNAMODB_TTL_ATTRIBUTE_NAME = 'expiresAt';

    expect(loadRunnerConfigStorageFromEnv()).toEqual({
      backend: 'dynamodb',
      dynamodb: {
        tableName: 'runner-config-table',
        partitionKeyName: 'pk',
        valueAttributeName: 'payload',
        configKeyPrefix: 'cfg#',
        consistentRead: false,
        tokenOverwriteProtectionEnabled: false,
        tokenKeyPrefix: 'token#',
        tokenTtlSeconds: 60,
        ttlAttributeName: 'expiresAt',
      },
    });
  });

  it('rejects invalid storage backends', () => {
    process.env.RUNNER_CONFIG_STORAGE_BACKEND = 's3';

    expect(() => loadRunnerConfigStorageFromEnv()).toThrow("Unsupported RUNNER_CONFIG_STORAGE_BACKEND 's3'");
  });

  it('requires DynamoDB token TTL to be provided by the environment', () => {
    process.env.RUNNER_CONFIG_STORAGE_BACKEND = 'dynamodb';
    process.env.RUNNER_CONFIG_DYNAMODB_TABLE_NAME = 'runner-config-table';
    process.env.RUNNER_CONFIG_DYNAMODB_TOKEN_KEY_PREFIX = 'token#';
    delete process.env.RUNNER_CONFIG_DYNAMODB_TTL_SECONDS;

    expect(() => loadRunnerConfigStorageFromEnv()).toThrow(
      'RUNNER_CONFIG_DYNAMODB_TTL_SECONDS must be set and be a positive integer',
    );
  });
});

describe('DynamoDbRunnerConfigStore', () => {
  function createDynamoDbStore() {
    return createRunnerConfigStore({
      ...BASE_CONFIG,
      runnerConfigStorage: {
        backend: 'dynamodb',
        dynamodb: {
          tableName: 'runner-config-table',
          tokenKeyPrefix: 'arn:aws:ec2:us-east-1:123456789012:instance/',
          tokenTtlSeconds: 60,
        },
      },
    });
  }

  it('writes one-time runner config with a token TTL and conditional put', async () => {
    const store = createDynamoDbStore();
    mockDynamoDbClient.on(PutItemCommand).resolves({});

    await store.putRunnerConfig('i-1234567890', 'encoded-jit-config', {
      tags: [{ Key: 'InstanceId', Value: 'i-1234567890' }],
    });

    expect(mockDynamoDbClient).toHaveReceivedCommandWith(PutItemCommand, {
      TableName: 'runner-config-table',
      ConditionExpression: 'attribute_not_exists(#partition_key)',
      ExpressionAttributeNames: {
        '#partition_key': 'id',
      },
      Item: {
        id: { S: 'arn:aws:ec2:us-east-1:123456789012:instance/i-1234567890' },
        value: { S: 'encoded-jit-config' },
        expires_at: { N: '1786320060' },
      },
    });
  });

  it('reads and writes runner group cache values under the config key prefix', async () => {
    const store = createDynamoDbStore();
    mockDynamoDbClient.on(GetItemCommand).resolves({
      Item: {
        value: { S: '42' },
      },
    });
    mockDynamoDbClient.on(PutItemCommand).resolves({});

    await expect(store.getConfigValue('runner-group/Default')).resolves.toBe('42');
    await store.putConfigValue('runner-group/Default', '42');

    expect(mockDynamoDbClient).toHaveReceivedCommandWith(GetItemCommand, {
      TableName: 'runner-config-table',
      Key: {
        id: { S: 'config#runner-group/Default' },
      },
      ConsistentRead: true,
      ProjectionExpression: '#value',
      ExpressionAttributeNames: {
        '#value': 'value',
      },
    });
    expect(mockDynamoDbClient).toHaveReceivedCommandWith(PutItemCommand, {
      TableName: 'runner-config-table',
      Item: {
        id: { S: 'config#runner-group/Default' },
        value: { S: '42' },
      },
    });
  });

  it('uses custom DynamoDB key prefixes and attribute names', async () => {
    const store = createRunnerConfigStore({
      ...BASE_CONFIG,
      runnerConfigStorage: {
        backend: 'dynamodb',
        dynamodb: {
          tableName: 'runner-config-table',
          partitionKeyName: 'pk',
          valueAttributeName: 'payload',
          configKeyPrefix: 'cfg#',
          consistentRead: false,
          tokenOverwriteProtectionEnabled: false,
          tokenKeyPrefix: 'token#',
          tokenTtlSeconds: 60,
          ttlAttributeName: 'expiresAt',
        },
      },
    });
    mockDynamoDbClient.on(GetItemCommand).resolves({
      Item: {
        payload: { S: '42' },
      },
    });
    mockDynamoDbClient.on(PutItemCommand).resolves({});

    await expect(store.getConfigValue('runner-group/Default')).resolves.toBe('42');
    await store.putRunnerConfig('i-1234567890', 'encoded-jit-config', {
      tags: [{ Key: 'InstanceId', Value: 'i-1234567890' }],
    });

    expect(mockDynamoDbClient).toHaveReceivedCommandWith(GetItemCommand, {
      TableName: 'runner-config-table',
      Key: {
        pk: { S: 'cfg#runner-group/Default' },
      },
      ConsistentRead: false,
      ProjectionExpression: '#value',
      ExpressionAttributeNames: {
        '#value': 'payload',
      },
    });
    expect(mockDynamoDbClient).toHaveReceivedCommandWith(PutItemCommand, {
      TableName: 'runner-config-table',
      Item: {
        pk: { S: 'token#i-1234567890' },
        payload: { S: 'encoded-jit-config' },
        expiresAt: { N: '1786320060' },
      },
    });
  });
});
