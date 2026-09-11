import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  ConditionalCheckFailedException,
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';

vi.mock('@aws-github-runner/aws-powertools-util', async (importActual) => {
  const actual = await importActual<typeof import('@aws-github-runner/aws-powertools-util')>();
  return {
    ...actual,
    createSingleMetric: vi.fn(),
    getTracedAWSV3Client: (client: unknown) => client,
  };
});

import { createSingleMetric } from '@aws-github-runner/aws-powertools-util';
import {
  addToWarmPool,
  countWarmInstancesByOwner,
  emitWarmPoolMetric,
  getInstanceReadyMarker,
  getPoolStrategy,
  getWarmInstance,
  getWarmPoolConfig,
  listWarmInstancesByOwner,
  removeFromWarmPool,
} from './warm-pool';

const ddbMock = mockClient(DynamoDBClient);
const mockCreateSingleMetric = vi.mocked(createSingleMetric);

describe('warm-pool DynamoDB client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    ddbMock.reset();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.WARM_POOL_TABLE_NAME = 'test-warm-pool';
    process.env.WARM_POOL_CONFIG = JSON.stringify({
      enabled: true,
      maxWarmInstances: 3,
      maxWarmAgeHours: 168,
      warmPoolReadyDelaySeconds: 30,
    });
    delete process.env.POOL_STRATEGY;
    delete process.env.ENABLE_METRIC_WARM_POOL;
  });

  describe('getWarmPoolConfig', () => {
    it('parses WARM_POOL_CONFIG from the environment', () => {
      expect(getWarmPoolConfig()).toEqual({
        enabled: true,
        maxWarmInstances: 3,
        maxWarmAgeHours: 168,
        warmPoolReadyDelaySeconds: 30,
      });
    });

    it('returns a disabled default when WARM_POOL_CONFIG is unset', () => {
      delete process.env.WARM_POOL_CONFIG;
      expect(getWarmPoolConfig().enabled).toBe(false);
    });
  });

  describe('getPoolStrategy', () => {
    it('defaults to hot', () => {
      expect(getPoolStrategy()).toBe('hot');
    });

    it('reads POOL_STRATEGY from the environment', () => {
      process.env.POOL_STRATEGY = 'warm';
      expect(getPoolStrategy()).toBe('warm');
    });
  });

  describe('addToWarmPool', () => {
    it('writes an item with the owner, environment and an expiry', async () => {
      ddbMock.on(PutItemCommand).resolves({});
      await addToWarmPool({
        instanceId: 'i-123',
        runnerOwner: 'Codertocat',
        environment: 'unit-test',
        runnerType: 'Org',
        amiId: 'ami-1',
      });

      const call = ddbMock.commandCalls(PutItemCommand)[0];
      expect(call.args[0].input.TableName).toBe('test-warm-pool');
      const item = call.args[0].input.Item!;
      expect(item.instanceId).toEqual({ S: 'i-123' });
      expect(item.runnerOwner).toEqual({ S: 'Codertocat' });
      expect(item.amiId).toEqual({ S: 'ami-1' });
      expect(item.expiresAt.N).toBeDefined();
    });
  });

  describe('removeFromWarmPool', () => {
    it('returns true when the item was deleted', async () => {
      ddbMock.on(DeleteItemCommand).resolves({});
      await expect(removeFromWarmPool('i-123')).resolves.toBe(true);
    });

    it('returns false when the item was already claimed', async () => {
      ddbMock.on(DeleteItemCommand).rejects(new ConditionalCheckFailedException({ message: 'gone', $metadata: {} }));
      await expect(removeFromWarmPool('i-123')).resolves.toBe(false);
    });

    it('rethrows unexpected errors', async () => {
      ddbMock.on(DeleteItemCommand).rejects(new Error('boom'));
      await expect(removeFromWarmPool('i-123')).rejects.toThrow('boom');
    });
  });

  describe('getWarmInstance', () => {
    it('returns null when the item does not exist', async () => {
      ddbMock.on(GetItemCommand).resolves({});
      await expect(getWarmInstance('i-404')).resolves.toBeNull();
    });

    it('maps a stored item to a WarmPoolEntry', async () => {
      ddbMock.on(GetItemCommand).resolves({
        Item: {
          instanceId: { S: 'i-1' },
          runnerOwner: { S: 'Codertocat' },
          environment: { S: 'unit-test' },
          runnerType: { S: 'Org' },
          stoppedAt: { S: '2026-01-01T00:00:00.000Z' },
          expiresAt: { N: '1700000000' },
        },
      });
      await expect(getWarmInstance('i-1')).resolves.toMatchObject({
        instanceId: 'i-1',
        runnerOwner: 'Codertocat',
        expiresAt: 1700000000,
      });
    });
  });

  describe('getInstanceReadyMarker', () => {
    it('returns null when the instance has not signalled readiness', async () => {
      ddbMock.on(GetItemCommand).resolves({});
      await expect(getInstanceReadyMarker('i-404')).resolves.toBeNull();
    });

    it('returns the readyAt timestamp when the marker exists', async () => {
      ddbMock.on(GetItemCommand).resolves({
        Item: { instanceId: { S: 'i-1' }, readyAt: { S: '2026-01-01T00:00:00Z' } },
      });
      await expect(getInstanceReadyMarker('i-1')).resolves.toBe('2026-01-01T00:00:00Z');
    });
  });

  describe('listWarmInstancesByOwner / countWarmInstancesByOwner', () => {
    it('lists entries for an owner using the by-owner index', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            instanceId: { S: 'i-1' },
            runnerOwner: { S: 'Codertocat' },
            environment: { S: 'unit-test' },
            runnerType: { S: 'Org' },
            stoppedAt: { S: '2026-01-01T00:00:00.000Z' },
            expiresAt: { N: '1700000000' },
          },
        ],
      });
      const entries = await listWarmInstancesByOwner('Codertocat');
      expect(entries).toHaveLength(1);
      expect(ddbMock.commandCalls(QueryCommand)[0].args[0].input.IndexName).toBe('by-owner');
    });

    it('counts entries for an owner', async () => {
      ddbMock.on(QueryCommand).resolves({ Count: 2 });
      await expect(countWarmInstancesByOwner('Codertocat')).resolves.toBe(2);
    });
  });

  describe('emitWarmPoolMetric', () => {
    it('does nothing when metrics are disabled', () => {
      emitWarmPoolMetric('WarmPoolInstanceStopped', 1);
      expect(mockCreateSingleMetric).not.toHaveBeenCalled();
    });

    it('emits when ENABLE_METRIC_WARM_POOL is true', () => {
      process.env.ENABLE_METRIC_WARM_POOL = 'true';
      emitWarmPoolMetric('WarmPoolInstanceStopped', 1, { Owner: 'Codertocat' });
      expect(mockCreateSingleMetric).toHaveBeenCalledWith(
        'WarmPoolInstanceStopped',
        expect.anything(),
        1,
        expect.objectContaining({ Owner: 'Codertocat' }),
      );
    });
  });
});
