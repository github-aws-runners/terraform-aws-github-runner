import type { Octokit } from '@octokit/rest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ec2RunnerResourceOperations } from '../runners';

// pool.ts pulls in these modules on import; stub the ones warmPoolGracePeriod does not exercise so the
// unit under test stays isolated from DynamoDB, the scale-up path, and EC2 provisioning.
vi.mock('../runners', () => ({ bootTimeExceeded: vi.fn() }));
vi.mock('./runner-creation', () => ({
  createRunners: vi.fn(),
  loadEc2ProviderConfig: vi.fn(),
  registerRunners: vi.fn(),
}));
vi.mock('./scale-up', () => ({ startWarmInstances: vi.fn() }));
vi.mock('./warm-pool', () => ({
  getInstanceReadyMarker: vi.fn(),
  addToWarmPool: vi.fn().mockResolvedValue(undefined),
  removeFromWarmPool: vi.fn().mockResolvedValue(true),
  resolveCurrentAmiId: vi.fn().mockResolvedValue('ami-1'),
  emitWarmPoolMetric: vi.fn(),
  // Unused by warmPoolGracePeriod but imported by pool.ts.
  countWarmInstancesByOwner: vi.fn(),
  getPoolStrategy: vi.fn(),
  getWarmPoolConfig: vi.fn(),
}));

import { warmPoolGracePeriod } from './pool';
import {
  addToWarmPool,
  emitWarmPoolMetric,
  getInstanceReadyMarker,
  removeFromWarmPool,
} from './warm-pool';

const mockGetReady = vi.mocked(getInstanceReadyMarker);
const mockAddToWarmPool = vi.mocked(addToWarmPool);
const mockRemoveFromWarmPool = vi.mocked(removeFromWarmPool);
const mockEmitMetric = vi.mocked(emitWarmPoolMetric);

const ec2Operations = {
  list: vi.fn(),
  create: vi.fn(),
  terminate: vi.fn(),
  stop: vi.fn().mockResolvedValue(undefined),
  start: vi.fn(),
  tag: vi.fn().mockResolvedValue(undefined),
  untag: vi.fn(),
  listActivePersistentSpotRequests: vi.fn(),
  cancelSpotRequests: vi.fn(),
} as unknown as Ec2RunnerResourceOperations;

// getGitHubRegisteredRunnerStatuses maps runner name (prefix stripped) -> status, so a runner named after
// the instance id resolves back to that instance.
function ghClientWith(runners: { name: string; busy: boolean; status: string }[]): Octokit {
  return {
    paginate: vi.fn().mockResolvedValue(runners),
    actions: { listSelfHostedRunnersForOrg: vi.fn() },
  } as unknown as Octokit;
}

describe('warmPoolGracePeriod', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ec2Operations.stop as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (ec2Operations.tag as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    mockAddToWarmPool.mockResolvedValue(undefined);
    mockRemoveFromWarmPool.mockResolvedValue(true);
  });

  it('stops an instance as soon as it signals readiness while still idle', async () => {
    mockGetReady.mockResolvedValue('2026-01-01T00:00:00Z');
    const ghClient = ghClientWith([{ name: 'i-ready', busy: false, status: 'online' }]);

    await warmPoolGracePeriod(ec2Operations, ['i-ready'], 30, 'owner', '', 'env', ghClient);

    expect(ec2Operations.stop).toHaveBeenCalledWith('i-ready');
    expect(mockAddToWarmPool).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 'i-ready', runnerOwner: 'owner' }),
    );
    expect(ec2Operations.tag).toHaveBeenCalledWith('i-ready', [{ Key: 'ghr:warm-pool-member', Value: 'true' }]);
    expect(mockEmitMetric).toHaveBeenCalledWith('WarmPoolInstanceStopped', 1, { Owner: 'owner' });
  });

  it('leaves a ready-but-busy instance running and clears its marker', async () => {
    mockGetReady.mockResolvedValue('2026-01-01T00:00:00Z');
    const ghClient = ghClientWith([{ name: 'i-busy', busy: true, status: 'online' }]);

    await warmPoolGracePeriod(ec2Operations, ['i-busy'], 30, 'owner', '', 'env', ghClient);

    expect(ec2Operations.stop).not.toHaveBeenCalled();
    expect(mockAddToWarmPool).not.toHaveBeenCalled();
    expect(ec2Operations.tag).toHaveBeenCalledWith('i-busy', [{ Key: 'ghr:warm-pool-grace-hit', Value: 'true' }]);
    expect(mockRemoveFromWarmPool).toHaveBeenCalledWith('i-busy');
    expect(mockEmitMetric).toHaveBeenCalledWith('WarmPoolInstanceStarted', 1, { Owner: 'owner' });
  });

  it('falls back to a plain idle check when no readiness signal arrives within the max wait', async () => {
    // maxWaitSeconds = 0 means the poll loop is skipped and the fallback branch decides immediately.
    const ghClient = ghClientWith([{ name: 'i-slow', busy: false, status: 'online' }]);

    await warmPoolGracePeriod(ec2Operations, ['i-slow'], 0, 'owner', '', 'env', ghClient);

    expect(mockGetReady).not.toHaveBeenCalled();
    expect(ec2Operations.stop).toHaveBeenCalledWith('i-slow');
    expect(mockAddToWarmPool).toHaveBeenCalledWith(expect.objectContaining({ instanceId: 'i-slow' }));
  });
});
