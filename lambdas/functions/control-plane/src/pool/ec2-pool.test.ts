import { bootTimeExceeded } from '../aws/ec2-runners';
import type { RunnerList } from '../aws/ec2-runners.d';
import { calculateEc2PoolSize } from './ec2-pool';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../aws/ec2-runners', async () => ({
  bootTimeExceeded: vi.fn(),
  listEC2Runners: vi.fn(),
}));

vi.mock('../scale-runners/ec2', async () => ({
  createRunners: vi.fn(),
}));

const mockBootTimeExceeded = vi.mocked(bootTimeExceeded);

describe('calculateEc2PoolSize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('counts registered online idle runners', () => {
    const runners: RunnerList[] = [{ instanceId: 'i-idle' }];
    const runnerStatus = new Map([['i-idle', { busy: false, status: 'online' }]]);

    expect(calculateEc2PoolSize(runners, runnerStatus)).toBe(1);
    expect(mockBootTimeExceeded).not.toHaveBeenCalled();
  });

  it('does not count registered busy or offline runners', () => {
    const runners: RunnerList[] = [{ instanceId: 'i-busy' }, { instanceId: 'i-offline' }];
    const runnerStatus = new Map([
      ['i-busy', { busy: true, status: 'online' }],
      ['i-offline', { busy: false, status: 'offline' }],
    ]);

    expect(calculateEc2PoolSize(runners, runnerStatus)).toBe(0);
    expect(mockBootTimeExceeded).not.toHaveBeenCalled();
  });

  it('counts unregistered runners that are still booting', () => {
    const runners: RunnerList[] = [{ instanceId: 'i-booting' }];
    mockBootTimeExceeded.mockReturnValue(false);

    expect(calculateEc2PoolSize(runners, new Map())).toBe(1);
  });

  it('does not count unregistered runners whose boot time expired', () => {
    const runners: RunnerList[] = [{ instanceId: 'i-expired' }];
    mockBootTimeExceeded.mockReturnValue(true);

    expect(calculateEc2PoolSize(runners, new Map())).toBe(0);
  });
});
