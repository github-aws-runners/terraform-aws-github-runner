import { describe, it, expect, beforeEach, vi } from 'vitest';

import { startRunner, tag, untag } from './../aws/ec2-runners';
import { getWarmPoolConfig, listWarmInstancesByOwner, removeFromWarmPool, emitWarmPoolMetric } from '../aws/warm-pool';
import { startWarmInstances } from './ec2-scale-up';

vi.mock('./../aws/ec2-runners', async () => ({
  createRunner: vi.fn(),
  listEC2Runners: vi.fn(),
  startRunner: vi.fn(),
  tag: vi.fn(),
  untag: vi.fn(),
  terminateRunner: vi.fn(),
}));

vi.mock('../aws/warm-pool', async () => ({
  getWarmPoolConfig: vi.fn(),
  getPoolStrategy: vi.fn(),
  listWarmInstancesByOwner: vi.fn(),
  removeFromWarmPool: vi.fn(),
  emitWarmPoolMetric: vi.fn(),
  addToWarmPool: vi.fn(),
  countWarmInstancesByOwner: vi.fn(),
}));

const mockStartRunner = vi.mocked(startRunner);
const mockTag = vi.mocked(tag);
const mockUntag = vi.mocked(untag);
const mockListWarmInstances = vi.mocked(listWarmInstancesByOwner);
const mockRemoveFromWarmPool = vi.mocked(removeFromWarmPool);
const mockEmitWarmPoolMetric = vi.mocked(emitWarmPoolMetric);

describe('startWarmInstances', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENVIRONMENT = 'test-env';

    vi.mocked(getWarmPoolConfig).mockReturnValue({
      enabled: true,
      maxWarmInstances: 3,
      maxWarmAgeHours: 168,
      warmPoolReadyDelaySeconds: 30,
    });
    mockStartRunner.mockResolvedValue(undefined);
    mockRemoveFromWarmPool.mockResolvedValue(true);
    mockTag.mockResolvedValue(undefined);
    mockUntag.mockResolvedValue(undefined);
  });

  it('should return empty array when count is 0', async () => {
    const result = await startWarmInstances('my-org', 0);

    expect(result).toEqual([]);
    expect(mockListWarmInstances).not.toHaveBeenCalled();
  });

  it('should return empty array when no warm instances available', async () => {
    mockListWarmInstances.mockResolvedValue([]);

    const result = await startWarmInstances('my-org', 1);

    expect(result).toEqual([]);
    expect(mockStartRunner).not.toHaveBeenCalled();
  });

  it('should start a warm instance and remove from pool', async () => {
    mockListWarmInstances.mockResolvedValue([
      {
        instanceId: 'i-warm-1',
        runnerOwner: 'my-org',
        environment: 'test-env',
        runnerType: 'Org',
        stoppedAt: '2026-01-01T00:00:00Z',
        expiresAt: 9999999999,
      },
    ]);

    const result = await startWarmInstances('my-org', 1);

    expect(result).toEqual(['i-warm-1']);
    expect(mockStartRunner).toHaveBeenCalledWith('i-warm-1');
    expect(mockRemoveFromWarmPool).toHaveBeenCalledWith('i-warm-1');
    expect(mockEmitWarmPoolMetric).toHaveBeenCalledWith('WarmPoolInstanceStarted', 1, { Owner: 'my-org' });
  });

  it('should tag instance as started-from-warm-pool after successful start', async () => {
    mockListWarmInstances.mockResolvedValue([
      {
        instanceId: 'i-warm-1',
        runnerOwner: 'my-org',
        environment: 'test-env',
        runnerType: 'Org',
        stoppedAt: '2026-01-01T00:00:00Z',
        expiresAt: 9999999999,
      },
    ]);

    const result = await startWarmInstances('my-org', 1);

    expect(result).toEqual(['i-warm-1']);
    expect(mockTag).toHaveBeenCalledWith('i-warm-1', [{ Key: 'ghr:started-from-warm-pool', Value: 'true' }]);
    expect(mockUntag).toHaveBeenCalledWith('i-warm-1', [{ Key: 'ghr:warm-pool-member' }]);
  });

  it('should succeed even if tag fails (best-effort)', async () => {
    mockTag.mockRejectedValue(new Error('UnauthorizedOperation'));
    mockListWarmInstances.mockResolvedValue([
      {
        instanceId: 'i-warm-1',
        runnerOwner: 'my-org',
        environment: 'test-env',
        runnerType: 'Org',
        stoppedAt: '2026-01-01T00:00:00Z',
        expiresAt: 9999999999,
      },
    ]);

    const result = await startWarmInstances('my-org', 1);

    // Instance should still be in the result — tag failure is non-fatal.
    expect(result).toEqual(['i-warm-1']);
    expect(mockStartRunner).toHaveBeenCalledWith('i-warm-1');
    expect(mockRemoveFromWarmPool).toHaveBeenCalledWith('i-warm-1');
  });

  it('should start multiple instances up to the requested count', async () => {
    mockListWarmInstances.mockResolvedValue([
      {
        instanceId: 'i-warm-1',
        runnerOwner: 'my-org',
        environment: 'test-env',
        runnerType: 'Org',
        stoppedAt: '2026-01-01T00:00:00Z',
        expiresAt: 9999999999,
      },
      {
        instanceId: 'i-warm-2',
        runnerOwner: 'my-org',
        environment: 'test-env',
        runnerType: 'Org',
        stoppedAt: '2026-01-01T01:00:00Z',
        expiresAt: 9999999999,
      },
      {
        instanceId: 'i-warm-3',
        runnerOwner: 'my-org',
        environment: 'test-env',
        runnerType: 'Org',
        stoppedAt: '2026-01-01T02:00:00Z',
        expiresAt: 9999999999,
      },
    ]);

    const result = await startWarmInstances('my-org', 2);

    expect(result).toEqual(['i-warm-1', 'i-warm-2']);
    expect(mockStartRunner).toHaveBeenCalledTimes(2);
    expect(mockStartRunner).toHaveBeenCalledWith('i-warm-1');
    expect(mockStartRunner).toHaveBeenCalledWith('i-warm-2');
  });

  it('should skip failed instances and continue with next', async () => {
    mockRemoveFromWarmPool.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    mockStartRunner.mockRejectedValueOnce(new Error('Instance terminated')).mockResolvedValueOnce(undefined);
    mockListWarmInstances.mockResolvedValue([
      {
        instanceId: 'i-bad',
        runnerOwner: 'my-org',
        environment: 'test-env',
        runnerType: 'Org',
        stoppedAt: '2026-01-01T00:00:00Z',
        expiresAt: 9999999999,
      },
      {
        instanceId: 'i-good',
        runnerOwner: 'my-org',
        environment: 'test-env',
        runnerType: 'Org',
        stoppedAt: '2026-01-01T01:00:00Z',
        expiresAt: 9999999999,
      },
    ]);

    const result = await startWarmInstances('my-org', 2);

    expect(result).toEqual(['i-good']);
    expect(mockEmitWarmPoolMetric).toHaveBeenCalledWith('WarmPoolStartFailed', 1, { Owner: 'my-org' });
  });

  it('should remove failed instance from DynamoDB', async () => {
    mockRemoveFromWarmPool.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    mockStartRunner.mockRejectedValue(new Error('Instance terminated'));
    mockListWarmInstances.mockResolvedValue([
      {
        instanceId: 'i-gone',
        runnerOwner: 'my-org',
        environment: 'test-env',
        runnerType: 'Org',
        stoppedAt: '2026-01-01T00:00:00Z',
        expiresAt: 9999999999,
      },
    ]);

    const result = await startWarmInstances('my-org', 1);

    expect(result).toEqual([]);
    // removeFromWarmPool called in the catch block for cleanup.
    expect(mockRemoveFromWarmPool).toHaveBeenCalledWith('i-gone');
  });

  it('should skip instance already claimed by another invocation', async () => {
    mockRemoveFromWarmPool.mockResolvedValue(false);
    mockListWarmInstances.mockResolvedValue([
      {
        instanceId: 'i-claimed',
        runnerOwner: 'my-org',
        environment: 'test-env',
        runnerType: 'Org',
        stoppedAt: '2026-01-01T00:00:00Z',
        expiresAt: 9999999999,
      },
    ]);

    const result = await startWarmInstances('my-org', 1);

    expect(result).toEqual([]);
    expect(mockStartRunner).not.toHaveBeenCalled();
  });

  it('should fallback to org-level lookup when repo-level owner has no instances', async () => {
    mockListWarmInstances.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        instanceId: 'i-org-warm',
        runnerOwner: 'my-org',
        environment: 'test-env',
        runnerType: 'Org',
        stoppedAt: '2026-01-01T00:00:00Z',
        expiresAt: 9999999999,
      },
    ]);

    const result = await startWarmInstances('my-org/my-repo', 1);

    expect(result).toEqual(['i-org-warm']);
    expect(mockListWarmInstances).toHaveBeenCalledWith('my-org/my-repo');
    expect(mockListWarmInstances).toHaveBeenCalledWith('my-org');
  });

  it('should not fallback to org-level when owner has no slash', async () => {
    mockListWarmInstances.mockResolvedValue([]);

    const result = await startWarmInstances('my-org', 1);

    expect(result).toEqual([]);
    expect(mockListWarmInstances).toHaveBeenCalledTimes(1);
    expect(mockListWarmInstances).toHaveBeenCalledWith('my-org');
  });
});
