import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';
import { beforeEach, describe, expect, it } from 'vitest';

import { resetDynamoDbClient } from './client';
import { createAwsDynamoDbGitHubWebhookSecretStore } from './github-webhook-secret-store';

const mockDynamoDbClient = mockClient(DynamoDBClient);
const cleanEnv = process.env;

describe('aws_dynamodb GitHub webhook secret store', () => {
  beforeEach(() => {
    mockDynamoDbClient.reset();
    resetDynamoDbClient();
    process.env = { ...cleanEnv };
    process.env.AWS_REGION = 'eu-west-1';
    process.env.RUNNER_CONFIG_DYNAMODB_CONFIG_TABLE_NAME = 'runner-configuration';
  });

  it('strongly reads the global webhook secret', async () => {
    mockDynamoDbClient.on(GetItemCommand).resolves({ Item: { value: { S: 'webhook-secret' } } });

    await expect(createAwsDynamoDbGitHubWebhookSecretStore().get()).resolves.toBe('webhook-secret');
    expect(mockDynamoDbClient).toHaveReceivedCommandWith(GetItemCommand, {
      TableName: 'runner-configuration',
      Key: {
        scope: { S: 'global#webhook' },
        id: { S: 'github-webhook-secret' },
      },
      ConsistentRead: true,
      ProjectionExpression: '#value',
      ExpressionAttributeNames: { '#value': 'value' },
    });
  });

  it('leaves empty-value validation to the webhook config loader', async () => {
    mockDynamoDbClient.on(GetItemCommand).resolves({ Item: { value: { S: '' } } });

    await expect(createAwsDynamoDbGitHubWebhookSecretStore().get()).resolves.toBe('');
  });

  it('rejects a missing secret item without logging or returning a value', async () => {
    mockDynamoDbClient.on(GetItemCommand).resolves({});

    await expect(createAwsDynamoDbGitHubWebhookSecretStore().get()).rejects.toThrow(
      "GitHub webhook secret item 'global#webhook/github-webhook-secret' was not found",
    );
  });

  it('rejects a non-string secret item', async () => {
    mockDynamoDbClient.on(GetItemCommand).resolves({ Item: { value: { B: new Uint8Array() } } });

    await expect(createAwsDynamoDbGitHubWebhookSecretStore().get()).rejects.toThrow(
      "GitHub webhook secret item 'global#webhook/github-webhook-secret' does not contain a string value",
    );
  });

  it('requires the durable table name before reading', () => {
    delete process.env.RUNNER_CONFIG_DYNAMODB_CONFIG_TABLE_NAME;

    expect(() => createAwsDynamoDbGitHubWebhookSecretStore()).toThrow(
      'Environment variable RUNNER_CONFIG_DYNAMODB_CONFIG_TABLE_NAME is not set',
    );
    expect(mockDynamoDbClient.calls()).toHaveLength(0);
  });

  it('propagates read errors without handling the secret value', async () => {
    const error = new Error('access denied');
    mockDynamoDbClient.on(GetItemCommand).rejects(error);

    await expect(createAwsDynamoDbGitHubWebhookSecretStore().get()).rejects.toBe(error);
  });
});
