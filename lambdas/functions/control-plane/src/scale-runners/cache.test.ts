import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ec2RunnerCountCache, dynamoDbRunnerCountCache } from './cache';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

const mockDynamoDBClient = mockClient(DynamoDBClient);

describe('ec2RunnerCountCache', () => {
  beforeEach(() => {
    ec2RunnerCountCache.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('get', () => {
    it('should return undefined when cache is empty', () => {
      const result = ec2RunnerCountCache.get('prod', 'Org', 'my-org');
      expect(result).toBeUndefined();
    });

    it('should return cached value when within TTL', () => {
      ec2RunnerCountCache.set('prod', 'Org', 'my-org', 10);

      // Advance time by 3 seconds (within default 5s TTL)
      vi.advanceTimersByTime(3000);

      const result = ec2RunnerCountCache.get('prod', 'Org', 'my-org');
      expect(result).toBe(10);
    });

    it('should return undefined when cache entry is expired', () => {
      ec2RunnerCountCache.set('prod', 'Org', 'my-org', 10);

      // Advance time by 6 seconds (past default 5s TTL)
      vi.advanceTimersByTime(6000);

      const result = ec2RunnerCountCache.get('prod', 'Org', 'my-org');
      expect(result).toBeUndefined();
    });

    it('should respect custom TTL', () => {
      ec2RunnerCountCache.set('prod', 'Org', 'my-org', 10);

      // Advance time by 8 seconds
      vi.advanceTimersByTime(8000);

      // Should be expired with default TTL but valid with custom 10s TTL
      const expiredResult = ec2RunnerCountCache.get('prod', 'Org', 'my-org', 5000);
      expect(expiredResult).toBeUndefined();

      ec2RunnerCountCache.set('prod', 'Org', 'my-org', 15);
      vi.advanceTimersByTime(8000);

      const validResult = ec2RunnerCountCache.get('prod', 'Org', 'my-org', 10000);
      expect(validResult).toBe(15);
    });

    it('should return different values for different keys', () => {
      ec2RunnerCountCache.set('prod', 'Org', 'org-a', 10);
      ec2RunnerCountCache.set('prod', 'Org', 'org-b', 20);
      ec2RunnerCountCache.set('prod', 'Repo', 'owner/repo', 5);

      expect(ec2RunnerCountCache.get('prod', 'Org', 'org-a')).toBe(10);
      expect(ec2RunnerCountCache.get('prod', 'Org', 'org-b')).toBe(20);
      expect(ec2RunnerCountCache.get('prod', 'Repo', 'owner/repo')).toBe(5);
    });
  });

  describe('set', () => {
    it('should store value in cache', () => {
      ec2RunnerCountCache.set('prod', 'Org', 'my-org', 10);
      expect(ec2RunnerCountCache.get('prod', 'Org', 'my-org')).toBe(10);
    });

    it('should overwrite existing value', () => {
      ec2RunnerCountCache.set('prod', 'Org', 'my-org', 10);
      ec2RunnerCountCache.set('prod', 'Org', 'my-org', 20);
      expect(ec2RunnerCountCache.get('prod', 'Org', 'my-org')).toBe(20);
    });
  });

  describe('increment', () => {
    it('should increment existing cached value', () => {
      ec2RunnerCountCache.set('prod', 'Org', 'my-org', 10);
      ec2RunnerCountCache.increment('prod', 'Org', 'my-org', 5);
      expect(ec2RunnerCountCache.get('prod', 'Org', 'my-org')).toBe(15);
    });

    it('should handle negative increments (decrement)', () => {
      ec2RunnerCountCache.set('prod', 'Org', 'my-org', 10);
      ec2RunnerCountCache.increment('prod', 'Org', 'my-org', -3);
      expect(ec2RunnerCountCache.get('prod', 'Org', 'my-org')).toBe(7);
    });

    it('should do nothing if cache entry does not exist', () => {
      ec2RunnerCountCache.increment('prod', 'Org', 'my-org', 5);
      expect(ec2RunnerCountCache.get('prod', 'Org', 'my-org')).toBeUndefined();
    });

    it('should reset TTL on increment', () => {
      ec2RunnerCountCache.set('prod', 'Org', 'my-org', 10);

      // Advance time by 4 seconds
      vi.advanceTimersByTime(4000);

      // Increment, which should reset the TTL
      ec2RunnerCountCache.increment('prod', 'Org', 'my-org', 1);

      // Advance another 4 seconds (total 8 seconds from original set, but only 4 from increment)
      vi.advanceTimersByTime(4000);

      // Should still be valid because TTL was reset
      expect(ec2RunnerCountCache.get('prod', 'Org', 'my-org')).toBe(11);
    });
  });

  describe('reset', () => {
    it('should clear all cache entries', () => {
      ec2RunnerCountCache.set('prod', 'Org', 'org-a', 10);
      ec2RunnerCountCache.set('prod', 'Org', 'org-b', 20);

      expect(ec2RunnerCountCache.size()).toBe(2);

      ec2RunnerCountCache.reset();

      expect(ec2RunnerCountCache.size()).toBe(0);
      expect(ec2RunnerCountCache.get('prod', 'Org', 'org-a')).toBeUndefined();
    });
  });

  describe('size', () => {
    it('should return correct cache size', () => {
      expect(ec2RunnerCountCache.size()).toBe(0);

      ec2RunnerCountCache.set('prod', 'Org', 'org-a', 10);
      expect(ec2RunnerCountCache.size()).toBe(1);

      ec2RunnerCountCache.set('prod', 'Org', 'org-b', 20);
      expect(ec2RunnerCountCache.size()).toBe(2);
    });
  });
});

describe('dynamoDbRunnerCountCache', () => {
  beforeEach(() => {
    dynamoDbRunnerCountCache.reset();
    mockDynamoDBClient.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isEnabled', () => {
    it('should return false when not initialized', () => {
      expect(dynamoDbRunnerCountCache.isEnabled()).toBe(false);
    });

    it('should return true after initialization', () => {
      dynamoDbRunnerCountCache.initialize('test-table', 'us-east-1', 60000);
      expect(dynamoDbRunnerCountCache.isEnabled()).toBe(true);
    });
  });

  describe('get', () => {
    beforeEach(() => {
      dynamoDbRunnerCountCache.initialize('test-table', 'us-east-1', 60000);
    });

    it('should return null when item not found in DynamoDB', async () => {
      mockDynamoDBClient.on(GetItemCommand).resolves({
        Item: undefined,
      });

      const result = await dynamoDbRunnerCountCache.get('prod', 'Org', 'my-org');
      expect(result).toBeNull();
    });

    it('should return count and isStale=false when item is fresh', async () => {
      const now = Date.now();
      mockDynamoDBClient.on(GetItemCommand).resolves({
        Item: {
          pk: { S: 'prod#Org#my-org' },
          count: { N: '10' },
          updated: { N: String(now - 30000) }, // 30 seconds ago
        },
      });

      const result = await dynamoDbRunnerCountCache.get('prod', 'Org', 'my-org');
      expect(result).toEqual({ count: 10, isStale: false });
    });

    it('should return count and isStale=true when item is stale', async () => {
      const now = Date.now();
      mockDynamoDBClient.on(GetItemCommand).resolves({
        Item: {
          pk: { S: 'prod#Org#my-org' },
          count: { N: '10' },
          updated: { N: String(now - 120000) }, // 2 minutes ago
        },
      });

      const result = await dynamoDbRunnerCountCache.get('prod', 'Org', 'my-org');
      expect(result).toEqual({ count: 10, isStale: true });
    });

    it('should return count >= 0 even if DynamoDB count is negative', async () => {
      const now = Date.now();
      mockDynamoDBClient.on(GetItemCommand).resolves({
        Item: {
          pk: { S: 'prod#Org#my-org' },
          count: { N: '-5' }, // Negative count due to race conditions
          updated: { N: String(now) },
        },
      });

      const result = await dynamoDbRunnerCountCache.get('prod', 'Org', 'my-org');
      expect(result).toEqual({ count: 0, isStale: false });
    });

    it('should return null on DynamoDB error', async () => {
      mockDynamoDBClient.on(GetItemCommand).rejects(new Error('DynamoDB error'));

      const result = await dynamoDbRunnerCountCache.get('prod', 'Org', 'my-org');
      expect(result).toBeNull();
    });

    it('should return null when not enabled', async () => {
      dynamoDbRunnerCountCache.reset();

      const result = await dynamoDbRunnerCountCache.get('prod', 'Org', 'my-org');
      expect(result).toBeNull();
    });
  });
});
