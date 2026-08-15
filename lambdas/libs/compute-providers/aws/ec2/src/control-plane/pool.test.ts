import type { CreateStartRunnerConfig, RunnerInfo } from '../../../../core';
import { calculateEc2PoolSize, createEc2PoolProvider } from './pool';
import { bootTimeExceeded, listEC2Runners } from './runners';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./runners', () => ({
  bootTimeExceeded: vi.fn(),
  listEC2Runners: vi.fn(),
}));

const mockBootTimeExceeded = vi.mocked(bootTimeExceeded);
const mockListRunners = vi.mocked(listEC2Runners);

describe('calculateEc2PoolSize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('counts registered online idle runners', () => {
    const runners: RunnerInfo[] = [{ id: 'i-idle', owner: 'owner', type: 'Org' }];
    const runnerStatus = new Map([['i-idle', { busy: false, status: 'online' }]]);

    expect(calculateEc2PoolSize(runners, runnerStatus)).toBe(1);
    expect(mockBootTimeExceeded).not.toHaveBeenCalled();
  });

  it('does not count registered busy or offline runners', () => {
    const runners: RunnerInfo[] = [
      { id: 'i-busy', owner: 'owner', type: 'Org' },
      { id: 'i-offline', owner: 'owner', type: 'Org' },
    ];
    const runnerStatus = new Map([
      ['i-busy', { busy: true, status: 'online' }],
      ['i-offline', { busy: false, status: 'offline' }],
    ]);

    expect(calculateEc2PoolSize(runners, runnerStatus)).toBe(0);
    expect(mockBootTimeExceeded).not.toHaveBeenCalled();
  });

  it('counts unregistered runners that are still booting', () => {
    const runners: RunnerInfo[] = [{ id: 'i-booting', owner: 'owner', type: 'Org' }];
    mockBootTimeExceeded.mockReturnValue(false);

    expect(calculateEc2PoolSize(runners, new Map())).toBe(1);
  });

  it('does not count unregistered runners whose boot time expired', () => {
    const runners: RunnerInfo[] = [{ id: 'i-expired', owner: 'owner', type: 'Org' }];
    mockBootTimeExceeded.mockReturnValue(true);

    expect(calculateEc2PoolSize(runners, new Map())).toBe(0);
  });
});

describe('EC2 pool provider ownership', () => {
  it('lists only legacy scale-up and pool runners', async () => {
    mockListRunners.mockResolvedValue([]);
    const provider = createEc2PoolProvider(vi.fn<CreateStartRunnerConfig>());

    await expect(
      provider.listRunners({
        environment: 'unit-test-environment',
        runnerOwner: 'octo-org',
        runnerType: 'Org',
      }),
    ).resolves.toEqual([]);
    expect(mockListRunners).toHaveBeenCalledWith({
      environment: 'unit-test-environment',
      runnerOwner: 'octo-org',
      runnerType: 'Org',
      statuses: ['running'],
      source: ['scale-up-lambda', 'pool-lambda'],
    });
  });
});
