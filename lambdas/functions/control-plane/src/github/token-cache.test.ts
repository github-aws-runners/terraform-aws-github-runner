import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock('@aws-sdk/client-dynamodb', async () => {
  const actual = await vi.importActual<typeof import('@aws-sdk/client-dynamodb')>('@aws-sdk/client-dynamodb');
  class MockDynamoDBClient {
    send = mockSend;
  }
  return {
    ...actual,
    DynamoDBClient: MockDynamoDBClient,
  };
});

import {
  ConditionalCheckFailedException,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { getCachedInstallationToken } from './token-cache';

const installationId = 138041;

beforeEach(() => {
  mockSend.mockReset();
  process.env.INSTALLATION_TOKEN_TABLE_NAME = 'test-installation-tokens';
});

function freshTokenItem(expiresAtMs: number) {
  return {
    Item: {
      installation_id: { N: String(installationId) },
      token: { S: 'cached-token-abc' },
      expires_at_ms: { N: String(expiresAtMs) },
    },
  };
}

describe('getCachedInstallationToken', () => {
  it('returns cached token without calling mint when token is fresh', async () => {
    const farFuture = Date.now() + 30 * 60 * 1000;
    mockSend.mockImplementation(async (cmd: unknown) => {
      if (cmd instanceof GetItemCommand) return freshTokenItem(farFuture);
      throw new Error('unexpected command: ' + (cmd as { constructor: { name: string } }).constructor.name);
    });
    const mint = vi.fn();

    const result = await getCachedInstallationToken(installationId, mint);

    expect(result.token).toBe('cached-token-abc');
    expect(mint).not.toHaveBeenCalled();
  });

  it('refreshes ahead and mints when cached token is approaching expiry', async () => {
    const expiringSoon = Date.now() + 5 * 60 * 1000;
    const calls: string[] = [];
    mockSend.mockImplementation(async (cmd: unknown) => {
      if (cmd instanceof GetItemCommand) return freshTokenItem(expiringSoon);
      if (cmd instanceof UpdateItemCommand) {
        calls.push('lock-acquired');
        return {};
      }
      if (cmd instanceof PutItemCommand) {
        calls.push('cache-write');
        return {};
      }
      throw new Error('unexpected: ' + (cmd as { constructor: { name: string } }).constructor.name);
    });
    const mint = vi.fn().mockResolvedValue({
      token: 'fresh-token',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    const result = await getCachedInstallationToken(installationId, mint);

    expect(result.token).toBe('fresh-token');
    expect(mint).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['lock-acquired', 'cache-write']);
  });

  it('returns cached token when refresh-ahead lock is held by another Lambda', async () => {
    const expiringSoon = Date.now() + 5 * 60 * 1000;
    mockSend.mockImplementation(async (cmd: unknown) => {
      if (cmd instanceof GetItemCommand) return freshTokenItem(expiringSoon);
      if (cmd instanceof UpdateItemCommand) {
        throw new ConditionalCheckFailedException({ $metadata: {}, message: 'lock taken' });
      }
      throw new Error('unexpected: ' + (cmd as { constructor: { name: string } }).constructor.name);
    });
    const mint = vi.fn();

    const result = await getCachedInstallationToken(installationId, mint);

    expect(result.token).toBe('cached-token-abc');
    expect(mint).not.toHaveBeenCalled();
  });

  it('mints when cache is empty and we win the lock', async () => {
    mockSend.mockImplementation(async (cmd: unknown) => {
      if (cmd instanceof GetItemCommand) return { Item: undefined };
      if (cmd instanceof UpdateItemCommand) return {};
      if (cmd instanceof PutItemCommand) return {};
      throw new Error('unexpected: ' + (cmd as { constructor: { name: string } }).constructor.name);
    });
    const mint = vi.fn().mockResolvedValue({
      token: 'minted',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    const result = await getCachedInstallationToken(installationId, mint);

    expect(result.token).toBe('minted');
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it('on cold-cache miss + lost lock: waits, re-reads, returns new cached token', async () => {
    let getCalls = 0;
    mockSend.mockImplementation(async (cmd: unknown) => {
      if (cmd instanceof GetItemCommand) {
        getCalls++;
        if (getCalls === 1) return { Item: undefined };
        return freshTokenItem(Date.now() + 60 * 60 * 1000);
      }
      if (cmd instanceof UpdateItemCommand) {
        throw new ConditionalCheckFailedException({ $metadata: {}, message: 'lock taken' });
      }
      throw new Error('unexpected: ' + (cmd as { constructor: { name: string } }).constructor.name);
    });
    const mint = vi.fn();

    const result = await getCachedInstallationToken(installationId, mint);

    expect(result.token).toBe('cached-token-abc');
    expect(mint).not.toHaveBeenCalled();
    expect(getCalls).toBe(2);
  });

  it('on mint failure does not write to cache (lock expires naturally)', async () => {
    const calls: string[] = [];
    mockSend.mockImplementation(async (cmd: unknown) => {
      if (cmd instanceof GetItemCommand) return { Item: undefined };
      if (cmd instanceof UpdateItemCommand) {
        calls.push('lock-acquired');
        return {};
      }
      if (cmd instanceof PutItemCommand) {
        calls.push('SHOULD-NOT-WRITE');
        return {};
      }
      throw new Error('unexpected: ' + (cmd as { constructor: { name: string } }).constructor.name);
    });
    const error = Object.assign(new Error('Not Found'), { status: 404 });
    const mint = vi.fn().mockRejectedValue(error);

    await expect(getCachedInstallationToken(installationId, mint)).rejects.toMatchObject({
      status: 404,
    });
    expect(calls).toEqual(['lock-acquired']);
  });

  it('does not acquire lock when a valid cached token already exists (race prevention)', async () => {
    const freshExpiry = Date.now() + 50 * 60 * 1000;
    let getCalls = 0;
    mockSend.mockImplementation(async (cmd: unknown) => {
      if (cmd instanceof GetItemCommand) {
        getCalls++;
        if (getCalls === 1) {
          // First read: stale — no token
          return { Item: { installation_id: { N: String(installationId) } } };
        }
        // Second read: sees fresh token written by another Lambda
        return freshTokenItem(freshExpiry);
      }
      if (cmd instanceof UpdateItemCommand) {
        // DDB rejects because expires_at_ms > refreshAt
        throw new ConditionalCheckFailedException({
          message: 'Condition not met',
          $metadata: {},
        });
      }
      throw new Error('unexpected: ' + (cmd as { constructor: { name: string } }).constructor.name);
    });

    const mint = vi.fn();
    const result = await getCachedInstallationToken(installationId, mint);

    expect(mint).not.toHaveBeenCalled();
    expect(result.token).toBe('cached-token-abc');
    expect(getCalls).toBe(2);
  });

  it('mints directly when INSTALLATION_TOKEN_TABLE_NAME is not set (cache disabled)', async () => {
    delete process.env.INSTALLATION_TOKEN_TABLE_NAME;
    const mint = vi.fn().mockResolvedValue({
      token: 'direct-mint',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    const result = await getCachedInstallationToken(installationId, mint);

    expect(result.token).toBe('direct-mint');
    expect(mint).toHaveBeenCalledTimes(1);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
