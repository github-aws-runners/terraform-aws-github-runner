import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';
import { beforeEach, describe, expect, it } from 'vitest';

import { resetDynamoDbClient } from './client';
import { createAwsDynamoDbGitHubAppCredentialsStore } from './github-app-credentials-store';

const mockDynamoDbClient = mockClient(DynamoDBClient);
const cleanEnv = process.env;

describe('aws_dynamodb GitHub App credentials store', () => {
  beforeEach(() => {
    mockDynamoDbClient.reset();
    resetDynamoDbClient();
    process.env = { ...cleanEnv };
    process.env.AWS_REGION = 'eu-west-1';
    process.env.RUNNER_CONFIG_DYNAMODB_CONFIG_TABLE_NAME = 'runner-configuration';
  });

  it('strongly reads and decodes an ordered credential array', async () => {
    const value = JSON.stringify([
      { appId: 123, privateKeyBase64: Buffer.from('primary\\nkey').toString('base64') },
      {
        appId: 456,
        privateKeyBase64: Buffer.from('additional-key').toString('base64'),
        installationId: 789,
      },
    ]);
    mockDynamoDbClient.on(GetItemCommand).resolves({ Item: { value: { S: value } } });
    const store = createAwsDynamoDbGitHubAppCredentialsStore();

    await expect(store.get()).resolves.toEqual([
      { appId: 123, privateKey: 'primary\nkey', installationId: undefined },
      { appId: 456, privateKey: 'additional-key', installationId: 789 },
    ]);
    expect(mockDynamoDbClient).toHaveReceivedCommandWith(GetItemCommand, {
      TableName: 'runner-configuration',
      Key: {
        scope: { S: 'global#github-app' },
        id: { S: 'github-app-credentials' },
      },
      ConsistentRead: true,
      ProjectionExpression: '#value',
      ExpressionAttributeNames: { '#value': 'value' },
    });
  });

  it.each([
    ['not-json', 'contains invalid JSON'],
    ['[]', 'must contain a non-empty array'],
    [JSON.stringify([null]), 'credential at index 0 has an invalid stored value'],
    [JSON.stringify([{ appId: 0, privateKeyBase64: 'a2V5' }]), 'credential at index 0 has an invalid stored value'],
    [
      JSON.stringify([{ appId: 1, privateKeyBase64: 'not-base64' }]),
      'credential at index 0 has an invalid stored value',
    ],
    [
      JSON.stringify([{ appId: 1, privateKeyBase64: 'a2V5', installationId: 1.5 }]),
      'credential at index 0 has an invalid stored value',
    ],
  ])('rejects malformed stored credentials without returning their value', async (value, message) => {
    mockDynamoDbClient.on(GetItemCommand).resolves({ Item: { value: { S: value } } });
    const store = createAwsDynamoDbGitHubAppCredentialsStore();

    await expect(store.get()).rejects.toThrow(message);
  });

  it('rejects a missing credentials item', async () => {
    mockDynamoDbClient.on(GetItemCommand).resolves({});

    await expect(createAwsDynamoDbGitHubAppCredentialsStore().get()).rejects.toThrow(
      "GitHub App credentials item 'global#github-app/github-app-credentials' was not found",
    );
  });

  it('rejects a non-string credentials value', async () => {
    mockDynamoDbClient.on(GetItemCommand).resolves({ Item: { value: { L: [] } } });

    await expect(createAwsDynamoDbGitHubAppCredentialsStore().get()).rejects.toThrow(
      "GitHub App credentials item 'global#github-app/github-app-credentials' does not contain a string value",
    );
  });

  it.each([undefined, '', '   '])('requires the durable table name for input %j', (tableName) => {
    if (tableName === undefined) {
      delete process.env.RUNNER_CONFIG_DYNAMODB_CONFIG_TABLE_NAME;
    } else {
      process.env.RUNNER_CONFIG_DYNAMODB_CONFIG_TABLE_NAME = tableName;
    }

    expect(() => createAwsDynamoDbGitHubAppCredentialsStore()).toThrow(
      'Environment variable RUNNER_CONFIG_DYNAMODB_CONFIG_TABLE_NAME is not set',
    );
  });

  it('propagates reads errors without exposing stored credentials', async () => {
    const error = new Error('access denied');
    mockDynamoDbClient.on(GetItemCommand).rejects(error);

    await expect(createAwsDynamoDbGitHubAppCredentialsStore().get()).rejects.toBe(error);
  });
});
