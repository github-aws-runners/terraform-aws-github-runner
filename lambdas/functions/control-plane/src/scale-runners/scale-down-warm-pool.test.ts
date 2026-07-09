import { describe, it, expect, beforeEach, vi } from 'vitest';
import { terminateRunner, listEC2Runners } from './../aws/runners';
import {
  getWarmPoolConfig,
  getPoolStrategy,
  listWarmInstancesByOwner,
  removeFromWarmPool,
  emitWarmPoolMetric,
} from '../aws/warm-pool';

vi.mock('./../aws/runners', async () => ({
  createRunner: vi.fn(),
  listEC2Runners: vi.fn().mockResolvedValue([]),
  startRunner: vi.fn(),
  stopRunner: vi.fn(),
  tag: vi.fn(),
  untag: vi.fn(),
  terminateRunner: vi.fn(),
  bootTimeExceeded: vi.fn().mockReturnValue(false),
}));

vi.mock('../aws/warm-pool', async () => ({
  getWarmPoolConfig: vi.fn(),
  getPoolStrategy: vi.fn(),
  addToWarmPool: vi.fn(),
  countWarmInstancesByOwner: vi.fn(),
  listWarmInstancesByOwner: vi.fn(),
  removeFromWarmPool: vi.fn(),
  emitWarmPoolMetric: vi.fn(),
  getWarmInstance: vi.fn(),
}));

vi.mock('./../github/auth', async () => ({
  createGithubAppAuth: vi.fn().mockResolvedValue({ token: 'test-token' }),
  createGithubInstallationAuth: vi.fn().mockResolvedValue({ token: 'test-token' }),
  createOctokitClient: vi.fn().mockResolvedValue({
    apps: { getOrgInstallation: vi.fn().mockResolvedValue({ data: { id: 1 } }) },
    actions: {
      listSelfHostedRunnersForOrg: vi.fn().mockResolvedValue({ data: { runners: [] } }),
      getSelfHostedRunnerForOrg: vi.fn().mockResolvedValue({ data: { busy: false }, headers: {} }),
      deleteSelfHostedRunnerFromOrg: vi.fn().mockResolvedValue({ status: 204 }),
    },
    paginate: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('../github/rate-limit', () => ({
  metricGitHubAppRateLimit: vi.fn(),
}));

vi.mock('@aws-github-runner/aws-ssm-util', async () => ({
  getParameter: vi.fn(),
  putParameter: vi.fn(),
}));

vi.mock('./job-retry', () => ({
  publishRetryMessage: vi.fn(),
  checkAndRetryJob: vi.fn(),
}));

// Need to import scaleDown after mocks are set up
const { scaleDown } = await import('./scale-down');

const mockGetWarmPoolConfig = vi.mocked(getWarmPoolConfig);
const mockGetPoolStrategy = vi.mocked(getPoolStrategy);
const mockListWarmInstances = vi.mocked(listWarmInstancesByOwner);
const mockRemoveFromWarmPool = vi.mocked(removeFromWarmPool);
const mockTerminateRunner = vi.mocked(terminateRunner);
const mockEmitWarmPoolMetric = vi.mocked(emitWarmPoolMetric);
const mockListEC2Runners = vi.mocked(listEC2Runners);

describe('scale-down warm pool eviction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENVIRONMENT = 'test-env';
    process.env.SCALE_DOWN_CONFIG = JSON.stringify([{ idleCount: 0, cron: '* * * * *', timeZone: 'UTC' }]);
    process.env.MINIMUM_RUNNING_TIME_IN_MINUTES = '5';
    process.env.RUNNER_BOOT_TIME_IN_MINUTES = '5';

    mockGetWarmPoolConfig.mockReturnValue({
      enabled: true,
      maxWarmInstances: 2,
      maxWarmAgeHours: 168,
      warmPoolReadyDelaySeconds: 30,
    });
    mockGetPoolStrategy.mockReturnValue('warm');
    mockListEC2Runners.mockResolvedValue([]);
  });

  it('should skip eviction when warm pool is disabled', async () => {
    mockGetWarmPoolConfig.mockReturnValue({
      enabled: false,
      maxWarmInstances: 3,
      maxWarmAgeHours: 168,
      warmPoolReadyDelaySeconds: 30,
    });

    await scaleDown();

    expect(mockListWarmInstances).not.toHaveBeenCalled();
  });

  it('should evict warm instances exceeding max age', async () => {
    mockListEC2Runners.mockResolvedValue([
      { instanceId: 'i-running', owner: 'my-org', type: 'Org' } as any,
    ]);
    const oldDate = new Date(Date.now() - 200 * 3600 * 1000).toISOString(); // 200 hours ago
    mockListWarmInstances.mockResolvedValue([
      {
        instanceId: 'i-old-warm',
        runnerOwner: 'my-org',
        environment: 'test-env',
        runnerType: 'Org',
        stoppedAt: oldDate,
        expiresAt: 9999999999,
      },
    ]);
    mockTerminateRunner.mockResolvedValue(undefined);
    mockRemoveFromWarmPool.mockResolvedValue(undefined);

    await scaleDown();

    expect(mockTerminateRunner).toHaveBeenCalledWith('i-old-warm');
    expect(mockRemoveFromWarmPool).toHaveBeenCalledWith('i-old-warm');
  });

  it('should evict warm instances exceeding max count', async () => {
    mockListEC2Runners.mockResolvedValue([
      { instanceId: 'i-running', owner: 'my-org', type: 'Org' } as any,
    ]);
    const recentDate = new Date(Date.now() - 1 * 3600 * 1000).toISOString(); // 1 hour ago
    mockListWarmInstances.mockResolvedValue([
      {
        instanceId: 'i-warm-1',
        runnerOwner: 'my-org',
        environment: 'test-env',
        runnerType: 'Org',
        stoppedAt: recentDate,
        expiresAt: 9999999999,
      },
      {
        instanceId: 'i-warm-2',
        runnerOwner: 'my-org',
        environment: 'test-env',
        runnerType: 'Org',
        stoppedAt: recentDate,
        expiresAt: 9999999999,
      },
      {
        instanceId: 'i-warm-3',
        runnerOwner: 'my-org',
        environment: 'test-env',
        runnerType: 'Org',
        stoppedAt: recentDate,
        expiresAt: 9999999999,
      },
    ]);
    mockTerminateRunner.mockResolvedValue(undefined);
    mockRemoveFromWarmPool.mockResolvedValue(undefined);

    await scaleDown();

    // maxWarmInstances is 2, so at least 1 warm instance should be evicted (i-warm-*)
    const warmEvictionCalls = mockTerminateRunner.mock.calls.filter(
      (call) => (call[0] as string).startsWith('i-warm-'),
    );
    expect(warmEvictionCalls).toHaveLength(1);
  });

  it('should emit WarmPoolSize metric after eviction', async () => {
    mockListEC2Runners.mockResolvedValue([
      { instanceId: 'i-running', owner: 'my-org', type: 'Org' } as any,
    ]);
    const oldDate = new Date(Date.now() - 200 * 3600 * 1000).toISOString();
    mockListWarmInstances.mockResolvedValue([
      {
        instanceId: 'i-old',
        runnerOwner: 'my-org',
        environment: 'test-env',
        runnerType: 'Org',
        stoppedAt: oldDate,
        expiresAt: 9999999999,
      },
      {
        instanceId: 'i-recent',
        runnerOwner: 'my-org',
        environment: 'test-env',
        runnerType: 'Org',
        stoppedAt: new Date().toISOString(),
        expiresAt: 9999999999,
      },
    ]);
    mockTerminateRunner.mockResolvedValue(undefined);
    mockRemoveFromWarmPool.mockResolvedValue(undefined);

    await scaleDown();

    // One evicted (old), one remaining
    expect(mockEmitWarmPoolMetric).toHaveBeenCalledWith('WarmPoolSize', 1, { Owner: 'my-org' });
  });
});
