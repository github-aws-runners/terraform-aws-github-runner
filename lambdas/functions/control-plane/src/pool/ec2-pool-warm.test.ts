import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addToWarmPool,
  countWarmInstancesByOwner,
  emitWarmPoolMetric,
  getPoolStrategy,
  getWarmPoolConfig,
} from '../aws/warm-pool';
import { stopRunner } from '../aws/ec2-runners';
import { createRunners, registerRunners } from '../scale-runners/ec2';
import { startWarmInstances } from '../scale-runners/ec2-scale-up';
import type { CreateGitHubRunnerConfig } from '../scale-runners/types';
import { createEc2PoolProvider } from './ec2-pool';

vi.mock('../aws/warm-pool', () => ({
  getWarmPoolConfig: vi.fn(),
  getPoolStrategy: vi.fn(),
  countWarmInstancesByOwner: vi.fn(),
  addToWarmPool: vi.fn().mockResolvedValue(undefined),
  emitWarmPoolMetric: vi.fn(),
}));

vi.mock('../aws/ec2-runners', () => ({
  listEC2Runners: vi.fn().mockResolvedValue([]),
  bootTimeExceeded: vi.fn().mockReturnValue(false),
  stopRunner: vi.fn().mockResolvedValue(undefined),
  tag: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../scale-runners/ec2', () => ({
  createRunners: vi.fn().mockResolvedValue({ instances: [], retryableErrorCount: 0, nonRetryableErrorCount: 0 }),
  registerRunners: vi.fn(),
  loadEc2ProviderConfig: vi.fn().mockReturnValue({
    ec2instanceCriteria: {},
    environment: 'test-env',
    launchTemplateName: 'test-lt',
    subnets: ['subnet-1'],
    amiIdSsmParameterName: '',
    tracingEnabled: false,
    onDemandFailoverOnError: [],
    scaleErrors: [],
  }),
}));

vi.mock('../scale-runners/ec2-scale-up', () => ({
  startWarmInstances: vi.fn().mockResolvedValue([]),
}));

vi.mock('../scale-runners/ec2-scale-down', () => ({
  resolveCurrentAmiId: vi.fn().mockResolvedValue(undefined),
}));

const mockGetWarmPoolConfig = vi.mocked(getWarmPoolConfig);
const mockGetPoolStrategy = vi.mocked(getPoolStrategy);
const mockCountWarmInstances = vi.mocked(countWarmInstancesByOwner);
const mockCreateRunners = vi.mocked(createRunners);
const mockRegisterRunners = vi.mocked(registerRunners);
const mockStartWarmInstances = vi.mocked(startWarmInstances);
const mockStopRunner = vi.mocked(stopRunner);
const mockAddToWarmPool = vi.mocked(addToWarmPool);
const mockEmitWarmPoolMetric = vi.mocked(emitWarmPoolMetric);

const enabledWarmConfig = {
  enabled: true,
  maxWarmInstances: 3,
  maxWarmAgeHours: 168,
  warmPoolReadyDelaySeconds: 30,
};

const githubRunnerConfig: CreateGitHubRunnerConfig = {
  ephemeral: false,
  enableJitConfig: false,
  runnerLabels: 'linux,x64',
  runnerGroup: '',
  runnerNamePrefix: '',
  runnerOwner: 'my-org',
  runnerType: 'Org',
  disableAutoUpdate: false,
  ssmTokenPath: '/runners/token',
  ssmConfigPath: '/runners/config',
  ssmParameterStoreTags: [],
};

const mockOctokit = {
  paginate: vi.fn().mockResolvedValue([]),
  actions: { listSelfHostedRunnersForOrg: vi.fn() },
} as never;

// registerRunners echoes the instances it is given so warm-start results flow through unchanged.
mockRegisterRunners.mockImplementation(async (_config, result) => ({
  instances: result.instances,
  retryableErrorCount: 0,
  nonRetryableErrorCount: 0,
}));

describe('ec2-pool warm behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENVIRONMENT = 'test-env';
    mockGetWarmPoolConfig.mockReturnValue(enabledWarmConfig);
    mockGetPoolStrategy.mockReturnValue('warm');
    mockCountWarmInstances.mockResolvedValue(0);
    mockStartWarmInstances.mockResolvedValue([]);
    mockCreateRunners.mockResolvedValue({ instances: [], retryableErrorCount: 0, nonRetryableErrorCount: 0 });
    mockRegisterRunners.mockImplementation(async (_config, result) => ({
      instances: result.instances,
      retryableErrorCount: 0,
      nonRetryableErrorCount: 0,
    }));
  });

  describe('additionalPoolCapacity', () => {
    it('counts warm instances toward the pool target with the warm strategy', async () => {
      mockCountWarmInstances.mockResolvedValue(2);
      const provider = createEc2PoolProvider();

      const capacity = await provider.additionalPoolCapacity!({
        environment: 'test-env',
        runnerOwner: 'my-org',
        runnerType: 'Org',
      });

      expect(capacity).toBe(2);
      expect(mockCountWarmInstances).toHaveBeenCalledWith('my-org');
    });

    it('does not count warm instances when the strategy is hot', async () => {
      mockGetPoolStrategy.mockReturnValue('hot');
      const provider = createEc2PoolProvider();

      const capacity = await provider.additionalPoolCapacity!({
        environment: 'test-env',
        runnerOwner: 'my-org',
        runnerType: 'Org',
      });

      expect(capacity).toBe(0);
      expect(mockCountWarmInstances).not.toHaveBeenCalled();
    });

    it('does not count warm instances when the warm pool is disabled', async () => {
      mockGetWarmPoolConfig.mockReturnValue({ ...enabledWarmConfig, enabled: false });
      const provider = createEc2PoolProvider();

      const capacity = await provider.additionalPoolCapacity!({
        environment: 'test-env',
        runnerOwner: 'my-org',
        runnerType: 'Org',
      });

      expect(capacity).toBe(0);
      expect(mockCountWarmInstances).not.toHaveBeenCalled();
    });
  });

  describe('createRunners', () => {
    it('starts warm instances first and cold-launches only the remainder', async () => {
      // Hot strategy avoids the grace-period path while still exercising warm-start-first behaviour.
      mockGetPoolStrategy.mockReturnValue('hot');
      mockStartWarmInstances.mockResolvedValue(['i-warm-1', 'i-warm-2']);
      mockCreateRunners.mockResolvedValue({
        instances: ['i-cold-1'],
        retryableErrorCount: 0,
        nonRetryableErrorCount: 0,
      });
      const provider = createEc2PoolProvider();

      const created = await provider.createRunners({
        githubRunnerConfig,
        numberOfRunners: 3,
        githubInstallationClient: mockOctokit,
      });

      expect(mockStartWarmInstances).toHaveBeenCalledWith('my-org', 3);
      expect(mockCreateRunners).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        1, // remaining after 2 warm instances
        mockOctokit,
        'pool-lambda',
      );
      expect(created).toEqual(['i-warm-1', 'i-warm-2', 'i-cold-1']);
    });

    it('does not cold-launch when warm instances satisfy the full top-up', async () => {
      mockGetPoolStrategy.mockReturnValue('hot');
      mockStartWarmInstances.mockResolvedValue(['i-warm-1', 'i-warm-2']);
      const provider = createEc2PoolProvider();

      const created = await provider.createRunners({
        githubRunnerConfig,
        numberOfRunners: 2,
        githubInstallationClient: mockOctokit,
      });

      expect(mockStartWarmInstances).toHaveBeenCalledWith('my-org', 2);
      expect(mockCreateRunners).not.toHaveBeenCalled();
      expect(created).toEqual(['i-warm-1', 'i-warm-2']);
    });

    it('does not start warm instances when the warm pool is disabled', async () => {
      mockGetWarmPoolConfig.mockReturnValue({ ...enabledWarmConfig, enabled: false });
      mockGetPoolStrategy.mockReturnValue('hot');
      mockCreateRunners.mockResolvedValue({
        instances: ['i-cold-1', 'i-cold-2'],
        retryableErrorCount: 0,
        nonRetryableErrorCount: 0,
      });
      const provider = createEc2PoolProvider();

      const created = await provider.createRunners({
        githubRunnerConfig,
        numberOfRunners: 2,
        githubInstallationClient: mockOctokit,
      });

      expect(mockStartWarmInstances).not.toHaveBeenCalled();
      expect(mockCreateRunners).toHaveBeenCalled();
      expect(created).toEqual(['i-cold-1', 'i-cold-2']);
    });

    it('stops idle newly-created runners after the grace period with the warm strategy', async () => {
      vi.useFakeTimers();
      try {
        mockGetPoolStrategy.mockReturnValue('warm');
        mockStartWarmInstances.mockResolvedValue([]);
        mockCreateRunners.mockResolvedValue({
          instances: ['i-cold-1'],
          retryableErrorCount: 0,
          nonRetryableErrorCount: 0,
        });
        // No registered runner => instance is idle after the grace period.
        mockOctokit.paginate.mockResolvedValue([]);
        const provider = createEc2PoolProvider();

        const promise = provider.createRunners({
          githubRunnerConfig,
          numberOfRunners: 1,
          githubInstallationClient: mockOctokit,
        });

        await vi.advanceTimersByTimeAsync(enabledWarmConfig.warmPoolReadyDelaySeconds * 1000);
        const created = await promise;

        expect(created).toEqual(['i-cold-1']);
        expect(mockStopRunner).toHaveBeenCalledWith('i-cold-1');
        expect(mockAddToWarmPool).toHaveBeenCalledWith(
          expect.objectContaining({ instanceId: 'i-cold-1', runnerOwner: 'my-org' }),
        );
        expect(mockEmitWarmPoolMetric).toHaveBeenCalledWith('WarmPoolInstanceStopped', 1, { Owner: 'my-org' });
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
