import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunnerInfo } from '../../../../core';
import type { Ec2RunnerResourceOperations, Ec2SpotRequestInfo } from '../runners';

vi.mock('./warm-pool', () => ({
  getWarmPoolConfig: vi.fn(),
  getPoolStrategy: vi.fn(),
  listWarmInstancesByOwner: vi.fn().mockResolvedValue([]),
  countWarmInstancesByOwner: vi.fn().mockResolvedValue(0),
  addToWarmPool: vi.fn().mockResolvedValue(undefined),
  removeFromWarmPool: vi.fn().mockResolvedValue(true),
  emitWarmPoolMetric: vi.fn(),
  resolveCurrentAmiId: vi.fn().mockResolvedValue(undefined),
}));

import { addToWarmPool, countWarmInstancesByOwner, getPoolStrategy, getWarmPoolConfig } from './warm-pool';
import { createEc2ScaleDownCapability } from './scale-down';

const mockGetWarmPoolConfig = vi.mocked(getWarmPoolConfig);
const mockGetPoolStrategy = vi.mocked(getPoolStrategy);
const mockCountWarmInstancesByOwner = vi.mocked(countWarmInstancesByOwner);
const mockAddToWarmPool = vi.mocked(addToWarmPool);

const mockList = vi.fn<Ec2RunnerResourceOperations['list']>();
const mockTerminate = vi.fn<Ec2RunnerResourceOperations['terminate']>().mockResolvedValue();
const mockStop = vi.fn<Ec2RunnerResourceOperations['stop']>().mockResolvedValue();
const mockStart = vi.fn<Ec2RunnerResourceOperations['start']>().mockResolvedValue();
const mockTag = vi.fn<Ec2RunnerResourceOperations['tag']>().mockResolvedValue();
const mockUntag = vi.fn<Ec2RunnerResourceOperations['untag']>().mockResolvedValue();
const mockListSpotRequests = vi.fn<Ec2RunnerResourceOperations['listActivePersistentSpotRequests']>();
const mockCancelSpotRequests = vi.fn<Ec2RunnerResourceOperations['cancelSpotRequests']>().mockResolvedValue();

const ec2Operations: Ec2RunnerResourceOperations = {
  list: mockList,
  create: vi.fn(),
  terminate: mockTerminate,
  stop: mockStop,
  start: mockStart,
  tag: mockTag,
  untag: mockUntag,
  listActivePersistentSpotRequests: mockListSpotRequests,
  cancelSpotRequests: mockCancelSpotRequests,
};

const capability = createEc2ScaleDownCapability(ec2Operations);
const runner: RunnerInfo = { id: 'i-123', owner: 'Codertocat', type: 'Org' };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetWarmPoolConfig.mockReturnValue({
    enabled: true,
    maxWarmInstances: 3,
    maxWarmAgeHours: 168,
    warmPoolReadyDelaySeconds: 30,
  });
  mockGetPoolStrategy.mockReturnValue('warm');
  mockCountWarmInstancesByOwner.mockResolvedValue(0);
  mockList.mockResolvedValue([]);
  mockListSpotRequests.mockResolvedValue([]);
});

describe('retire', () => {
  it('stops the instance into the warm pool when warm strategy is enabled and there is capacity', async () => {
    await capability.retire!(runner);

    expect(mockStop).toHaveBeenCalledWith('i-123');
    expect(mockAddToWarmPool).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 'i-123', runnerOwner: 'Codertocat' }),
    );
    expect(mockTerminate).not.toHaveBeenCalled();
  });

  it('terminates instead of warm-pooling when the warm pool is full', async () => {
    mockCountWarmInstancesByOwner.mockResolvedValue(3);
    await capability.retire!(runner);

    expect(mockTerminate).toHaveBeenCalledWith('i-123');
    expect(mockStop).not.toHaveBeenCalled();
  });

  it('terminates when the warm pool is disabled', async () => {
    mockGetPoolStrategy.mockReturnValue('hot');
    await capability.retire!(runner);

    expect(mockTerminate).toHaveBeenCalledWith('i-123');
    expect(mockStop).not.toHaveBeenCalled();
  });
});

describe('maintain — stale persistent spot request reconciliation', () => {
  it('cancels stray requests and terminates untagged replacements, leaving managed ones', async () => {
    mockList.mockResolvedValue([{ id: 'i-managed', owner: 'Codertocat', type: 'Org' }]);
    const requests: Ec2SpotRequestInfo[] = [
      { spotInstanceRequestId: 'sir-legit', instanceId: 'i-managed' },
      { spotInstanceRequestId: 'sir-stray', instanceId: 'i-untagged-replacement' },
      { spotInstanceRequestId: 'sir-orphan' },
    ];
    mockListSpotRequests.mockResolvedValue(requests);

    await capability.maintain!('unit-test-environment');

    expect(mockCancelSpotRequests).toHaveBeenCalledWith(['sir-stray', 'sir-orphan']);
    expect(mockTerminate).toHaveBeenCalledWith('i-untagged-replacement');
    expect(mockTerminate).not.toHaveBeenCalledWith('i-managed');
  });

  it('does nothing when every persistent request backs a managed runner', async () => {
    mockList.mockResolvedValue([{ id: 'i-managed', owner: 'Codertocat', type: 'Org' }]);
    mockListSpotRequests.mockResolvedValue([{ spotInstanceRequestId: 'sir-legit', instanceId: 'i-managed' }]);

    await capability.maintain!('unit-test-environment');

    expect(mockCancelSpotRequests).not.toHaveBeenCalled();
  });
});
