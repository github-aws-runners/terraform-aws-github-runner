import { ConditionalCheckFailedException, DeleteItemCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AwsSdkDynamoDbRunnerConfigApi,
  createAwsDynamoDbRunnerConfigConsumer,
  type AwsDynamoDbRunnerConfigApi,
} from './runner-config-consumer';

const dynamoDbEnvironment = {
  RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_dynamodb',
  RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME: 'runner-state',
} as const;

function namedError(name: string, message = 'provider detail'): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe('AWS SDK DynamoDB runner config API', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('atomically deletes an unexpired composite-key item and returns its previous value', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const send = vi.fn().mockResolvedValue({ Attributes: { value: { S: 'encoded-jit' } } });
    const api = new AwsSdkDynamoDbRunnerConfigApi({ send } as unknown as DynamoDBClient);
    const signal = new AbortController().signal;

    await expect(api.deleteItem('runner-state', 'microvm-123', signal)).resolves.toBe('encoded-jit');

    expect(send.mock.calls[0][0]).toBeInstanceOf(DeleteItemCommand);
    expect(send.mock.calls[0][0].input).toEqual({
      TableName: 'runner-state',
      Key: {
        scope: { S: 'microvm-123' },
        id: { S: 'config' },
      },
      ConditionExpression: 'attribute_exists(#expires_at) AND #expires_at > :now',
      ExpressionAttributeNames: { '#expires_at': 'expires_at' },
      ExpressionAttributeValues: { ':now': { N: '1767225600' } },
      ReturnValues: 'ALL_OLD',
    });
    expect(send.mock.calls[0][1]).toEqual({ abortSignal: signal });
  });

  it('treats missing or expired records as unavailable after the conditional delete', async () => {
    const conditional = new ConditionalCheckFailedException({
      $metadata: {},
      message: 'record is absent or expired',
    });
    const api = new AwsSdkDynamoDbRunnerConfigApi({
      send: vi.fn().mockRejectedValue(conditional),
    } as unknown as DynamoDBClient);

    await expect(api.deleteItem('runner-state', 'microvm-123', new AbortController().signal)).resolves.toBeUndefined();
  });

  it('supports a deserialized conditional error without exposing its message', async () => {
    const api = new AwsSdkDynamoDbRunnerConfigApi({
      send: vi.fn().mockRejectedValue(namedError('ConditionalCheckFailedException', 'expired-secret-detail')),
    } as unknown as DynamoDBClient);

    await expect(api.deleteItem('runner-state', 'microvm-123', new AbortController().signal)).resolves.toBeUndefined();
  });

  it('propagates non-conditional provider errors', async () => {
    const error = namedError('AccessDeniedException');
    const api = new AwsSdkDynamoDbRunnerConfigApi({
      send: vi.fn().mockRejectedValue(error),
    } as unknown as DynamoDBClient);

    await expect(api.deleteItem('runner-state', 'microvm-123', new AbortController().signal)).rejects.toBe(error);
  });

  it('returns undefined when no item was deleted', async () => {
    const api = new AwsSdkDynamoDbRunnerConfigApi({
      send: vi.fn().mockResolvedValue({}),
    } as unknown as DynamoDBClient);

    await expect(api.deleteItem('runner-state', 'microvm-123', new AbortController().signal)).resolves.toBeUndefined();
  });

  it.each([{ Attributes: {} }, { Attributes: { value: { N: '1' } } }, { Attributes: { value: { S: '' } } }])(
    'rejects a deleted item without a string value %#',
    async (response) => {
      const api = new AwsSdkDynamoDbRunnerConfigApi({
        send: vi.fn().mockResolvedValue(response),
      } as unknown as DynamoDBClient);

      await expect(api.deleteItem('runner-state', 'microvm-123', new AbortController().signal)).rejects.toThrow(
        'runner configuration record has an invalid value',
      );
    },
  );
});

describe('DynamoDB runner config consumer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls until an atomic delete returns the stored configuration', async () => {
    const deleteItem = vi
      .fn<AwsDynamoDbRunnerConfigApi['deleteItem']>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('encoded-jit');
    const consumer = createAwsDynamoDbRunnerConfigConsumer(dynamoDbEnvironment, {
      api: { deleteItem },
      callTimeoutMs: 100,
      configTimeoutMs: 500,
      pollIntervalMs: 1,
    });

    await expect(
      consumer.consume('microvm-123', {
        deadlineMs: Date.now() + 1_000,
        signal: new AbortController().signal,
      }),
    ).resolves.toBe('encoded-jit');
    expect(deleteItem).toHaveBeenCalledTimes(2);
    expect(deleteItem).toHaveBeenCalledWith('runner-state', 'microvm-123', expect.any(AbortSignal));
  });

  it('retries transient provider failures', async () => {
    const deleteItem = vi
      .fn<AwsDynamoDbRunnerConfigApi['deleteItem']>()
      .mockRejectedValueOnce(namedError('ProvisionedThroughputExceededException'))
      .mockResolvedValueOnce('encoded-jit');
    const consumer = createAwsDynamoDbRunnerConfigConsumer(dynamoDbEnvironment, {
      api: { deleteItem },
      callTimeoutMs: 100,
      configTimeoutMs: 500,
      pollIntervalMs: 1,
    });

    await expect(
      consumer.consume('microvm-123', {
        deadlineMs: Date.now() + 1_000,
        signal: new AbortController().signal,
      }),
    ).resolves.toBe('encoded-jit');
    expect(deleteItem).toHaveBeenCalledTimes(2);
  });

  it('sanitizes non-retryable provider failures', async () => {
    const api: AwsDynamoDbRunnerConfigApi = {
      deleteItem: vi.fn().mockRejectedValue(namedError('AccessDeniedException', 'encoded-jit-secret')),
    };
    const consumer = createAwsDynamoDbRunnerConfigConsumer(dynamoDbEnvironment, {
      api,
      callTimeoutMs: 100,
      configTimeoutMs: 100,
      pollIntervalMs: 1,
    });

    const pending = consumer.consume('microvm-123', {
      deadlineMs: Date.now() + 1_000,
      signal: new AbortController().signal,
    });
    await expect(pending).rejects.toThrow('failed to consume runner configuration from DynamoDB');
    await expect(pending).rejects.not.toThrow('encoded-jit-secret');
  });

  it('validates the complete composite key before calling DynamoDB', async () => {
    const api: AwsDynamoDbRunnerConfigApi = { deleteItem: vi.fn() };
    const consumer = createAwsDynamoDbRunnerConfigConsumer(dynamoDbEnvironment, {
      api,
      callTimeoutMs: 100,
      configTimeoutMs: 100,
      pollIntervalMs: 1,
    });

    await expect(
      consumer.consume('invalid/scope', {
        deadlineMs: Date.now() + 1_000,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('runnerId is invalid');
    expect(api.deleteItem).not.toHaveBeenCalled();
  });

  it('times out while missing or expired items remain unavailable', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const api: AwsDynamoDbRunnerConfigApi = { deleteItem: vi.fn().mockResolvedValue(undefined) };
    const consumer = createAwsDynamoDbRunnerConfigConsumer(dynamoDbEnvironment, {
      api,
      callTimeoutMs: 10,
      configTimeoutMs: 20,
      pollIntervalMs: 5,
    });
    const pending = consumer.consume('microvm-123', {
      deadlineMs: Date.now() + 100,
      signal: new AbortController().signal,
    });
    const rejection = expect(pending).rejects.toThrow(
      'runner configuration did not become available before the deadline',
    );

    await vi.runAllTimersAsync();

    await rejection;
    expect(api.deleteItem).toHaveBeenCalled();
  });

  it('stops a provider call immediately when the caller aborts', async () => {
    const api: AwsDynamoDbRunnerConfigApi = {
      deleteItem: vi.fn().mockReturnValue(new Promise(() => undefined)),
    };
    const controller = new AbortController();
    const consumer = createAwsDynamoDbRunnerConfigConsumer(dynamoDbEnvironment, {
      api,
      callTimeoutMs: 10_000,
      configTimeoutMs: 10_000,
      pollIntervalMs: 1,
    });
    const pending = consumer.consume('microvm-123', {
      deadlineMs: Date.now() + 10_000,
      signal: controller.signal,
    });

    controller.abort();

    await expect(pending).rejects.toThrow('runner configuration consumption was cancelled');
  });
});
