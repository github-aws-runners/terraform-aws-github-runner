import {
  ConditionalCheckFailedException,
  DeleteItemCommand,
  DynamoDBClient,
  PutItemCommand,
  type PutItemCommandInput,
} from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createWarmLeaseStore, WARM_LEASE_TTL_SECONDS } from './warm-lease';

const mockDynamoClient = mockClient(DynamoDBClient);
const NOW = new Date('2026-09-30T12:00:00.000Z');
const NOW_SECONDS = NOW.getTime() / 1000;
const lease = createWarmLeaseStore(new DynamoDBClient({}), 'warm-leases');

function conditionalCheckFailed(): ConditionalCheckFailedException {
  return new ConditionalCheckFailedException({ message: 'The conditional request failed', $metadata: {} });
}

beforeEach(() => {
  mockDynamoClient.reset();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('warm lease store', () => {
  it('claims an instance with a conditional put and a TTL ten minutes out', async () => {
    mockDynamoClient.on(PutItemCommand).resolves({});

    await expect(lease.claim('i-1')).resolves.toBe(true);

    expect(WARM_LEASE_TTL_SECONDS).toBe(600);
    expect(mockDynamoClient).toHaveReceivedCommandWith(PutItemCommand, {
      TableName: 'warm-leases',
      Item: { instanceId: { S: 'i-1' }, expiresAt: { N: String(NOW_SECONDS + 600) } },
      ConditionExpression: 'attribute_not_exists(instanceId) OR expiresAt < :now',
      ExpressionAttributeValues: { ':now': { N: String(NOW_SECONDS) } },
    });
  });

  it('reports a lost claim when the condition fails', async () => {
    mockDynamoClient.on(PutItemCommand).rejects(conditionalCheckFailed());

    await expect(lease.claim('i-1')).resolves.toBe(false);
  });

  it('reports a lost claim when the condition failure arrives as a generic error', async () => {
    mockDynamoClient.on(PutItemCommand).rejects(new Error('ConditionalCheckFailedException'));

    await expect(lease.claim('i-1')).resolves.toBe(false);
  });

  it('throws when the table cannot be used', async () => {
    const error = Object.assign(new Error('missing'), { name: 'ResourceNotFoundException' });
    mockDynamoClient.on(PutItemCommand).rejects(error);

    await expect(lease.claim('i-1')).rejects.toThrow('missing');
  });

  it('lets exactly one of several concurrent claims for the same instance win', async () => {
    const held = new Set<string>();
    mockDynamoClient.on(PutItemCommand).callsFake(async (input: PutItemCommandInput) => {
      await Promise.resolve();
      const instanceId = input.Item?.instanceId.S as string;
      if (held.has(instanceId)) throw conditionalCheckFailed();
      held.add(instanceId);
      return {};
    });

    const results = await Promise.all([lease.claim('i-1'), lease.claim('i-1'), lease.claim('i-1')]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(mockDynamoClient).toHaveReceivedCommandTimes(PutItemCommand, 3);
  });

  it('releases a claim by deleting the item', async () => {
    mockDynamoClient.on(DeleteItemCommand).resolves({});

    await lease.release('i-1');

    expect(mockDynamoClient).toHaveReceivedCommandWith(DeleteItemCommand, {
      TableName: 'warm-leases',
      Key: { instanceId: { S: 'i-1' } },
    });
  });
});
