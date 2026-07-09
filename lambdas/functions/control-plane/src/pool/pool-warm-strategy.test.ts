import { describe, it, expect, beforeEach, vi } from 'vitest';
import { listEC2Runners } from '../aws/runners';
import { createRunners, findAndStartWarmRunners } from '../scale-runners/scale-up';
import { getPoolStrategy, getWarmPoolConfig, countWarmInstancesByOwner } from '../aws/warm-pool';
import { adjust } from './pool';

const mockOctokit = {
  paginate: vi.fn().mockResolvedValue([]),
  actions: {
    createRegistrationTokenForOrg: vi.fn(),
  },
  apps: {
    getOrgInstallation: vi.fn().mockResolvedValue({ data: { id: 1 } }),
  },
};

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(function () {
    return mockOctokit;
  }),
}));

vi.mock('./../aws/runners', async () => ({
  listEC2Runners: vi.fn().mockResolvedValue([]),
  bootTimeExceeded: vi.fn().mockReturnValue(false),
  stopRunner: vi.fn().mockResolvedValue(undefined),
  tag: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./../github/auth', async () => ({
  createGithubAppAuth: vi.fn().mockResolvedValue({ token: 'app-token', appId: 1, type: 'app' }),
  createGithubInstallationAuth: vi.fn().mockResolvedValue({ token: 'install-token', type: 'token' }),
  createOctokitClient: vi.fn().mockImplementation(() => mockOctokit),
}));

vi.mock('../scale-runners/scale-up', async () => ({
  scaleUp: vi.fn(),
  createRunners: vi.fn().mockResolvedValue([]),
  findAndStartWarmRunners: vi.fn().mockResolvedValue([]),
  getGitHubEnterpriseApiUrl: vi.fn().mockReturnValue({ ghesApiUrl: '', ghesBaseUrl: '' }),
  validateSsmParameterStoreTags: vi.fn().mockReturnValue([]),
}));

vi.mock('../aws/warm-pool', async () => ({
  getPoolStrategy: vi.fn().mockReturnValue('hot'),
  getWarmPoolConfig: vi
    .fn()
    .mockReturnValue({ enabled: false, maxWarmInstances: 3, maxWarmAgeHours: 168, warmPoolReadyDelaySeconds: 30 }),
  countWarmInstancesByOwner: vi.fn().mockResolvedValue(0),
  addToWarmPool: vi.fn().mockResolvedValue(undefined),
  emitWarmPoolMetric: vi.fn(),
}));

const mockListRunners = vi.mocked(listEC2Runners);
const mockCreateRunners = vi.mocked(createRunners);
const mockFindAndStartWarmRunners = vi.mocked(findAndStartWarmRunners);
const mockGetPoolStrategy = vi.mocked(getPoolStrategy);
const mockGetWarmPoolConfig = vi.mocked(getWarmPoolConfig);
const mockCountWarmInstances = vi.mocked(countWarmInstancesByOwner);

describe('pool warm strategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENVIRONMENT = 'test-env';
    process.env.RUNNER_OWNER = 'my-org';
    process.env.RUNNER_LABELS = 'linux,x64';
    process.env.RUNNER_GROUP_NAME = '';
    process.env.RUNNER_NAME_PREFIX = '';
    process.env.SSM_TOKEN_PATH = '/runners/token';
    process.env.SSM_CONFIG_PATH = '/runners/config';
    process.env.SUBNET_IDS = 'subnet-1,subnet-2';
    process.env.INSTANCE_TYPES = 'm5.large';
    process.env.INSTANCE_TARGET_CAPACITY_TYPE = 'on-demand';
    process.env.LAUNCH_TEMPLATE_NAME = 'test-lt';
    process.env.ENABLE_EPHEMERAL_RUNNERS = 'false';
    process.env.ENABLE_JIT_CONFIG = 'false';
    process.env.DISABLE_RUNNER_AUTOUPDATE = 'false';
    process.env.INSTANCE_MAX_SPOT_PRICE = '';
    process.env.INSTANCE_ALLOCATION_STRATEGY = 'lowest-price';
    process.env.RUNNERS_MAXIMUM_COUNT = '-1';
    process.env.SCALE_ERRORS = '["InsufficientInstanceCapacity"]';
    process.env.POWERTOOLS_TRACE_ENABLED = 'false';
    process.env.ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS = '[]';
    process.env.AMI_ID_SSM_PARAMETER_NAME = '';
    process.env.SSM_PARAMETER_STORE_TAGS = '';

    mockListRunners.mockResolvedValue([]);
    mockOctokit.paginate.mockResolvedValue([]);
    mockFindAndStartWarmRunners.mockResolvedValue([]);
  });

  it('should count warm instances toward pool target with warm strategy', async () => {
    mockGetPoolStrategy.mockReturnValue('warm');
    mockGetWarmPoolConfig.mockReturnValue({
      enabled: true,
      maxWarmInstances: 3,
      maxWarmAgeHours: 168,
      warmPoolReadyDelaySeconds: 30,
    });
    mockCountWarmInstances.mockResolvedValue(2);
    // 0 running + 2 warm = 2 effective, pool size = 2 → no top-up needed
    mockListRunners.mockResolvedValue([]);

    await adjust({ poolSize: 2 });

    expect(mockCountWarmInstances).toHaveBeenCalledWith('my-org');
    expect(mockCreateRunners).not.toHaveBeenCalled();
    expect(mockFindAndStartWarmRunners).not.toHaveBeenCalled();
  });

  it('should try warm instances first when topping up', async () => {
    mockGetPoolStrategy.mockReturnValue('warm');
    mockGetWarmPoolConfig.mockReturnValue({
      enabled: true,
      maxWarmInstances: 3,
      maxWarmAgeHours: 168,
      warmPoolReadyDelaySeconds: 30,
    });
    mockCountWarmInstances.mockResolvedValue(0);
    // Pool wants 3, has 0 → needs 3, warm start returns 2 → 1 cold needed
    mockFindAndStartWarmRunners.mockResolvedValue(['i-warm-1', 'i-warm-2']);

    await adjust({ poolSize: 3 });

    expect(mockFindAndStartWarmRunners).toHaveBeenCalledWith('my-org', 3, expect.any(Object), expect.anything());
    expect(mockCreateRunners).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      1, // remainingTopUp = 3 - 2
      expect.anything(),
      'pool-lambda',
    );
  });

  it('should not cold-launch if warm instances satisfy the full top-up', async () => {
    mockGetPoolStrategy.mockReturnValue('warm');
    mockGetWarmPoolConfig.mockReturnValue({
      enabled: true,
      maxWarmInstances: 3,
      maxWarmAgeHours: 168,
      warmPoolReadyDelaySeconds: 30,
    });
    mockCountWarmInstances.mockResolvedValue(0);
    mockFindAndStartWarmRunners.mockResolvedValue(['i-warm-1', 'i-warm-2']);

    await adjust({ poolSize: 2 });

    expect(mockFindAndStartWarmRunners).toHaveBeenCalledWith('my-org', 2, expect.any(Object), expect.anything());
    expect(mockCreateRunners).not.toHaveBeenCalled();
  });

  it('should not count warm instances when strategy is hot', async () => {
    mockGetPoolStrategy.mockReturnValue('hot');
    mockGetWarmPoolConfig.mockReturnValue({
      enabled: true,
      maxWarmInstances: 3,
      maxWarmAgeHours: 168,
      warmPoolReadyDelaySeconds: 30,
    });
    // With hot strategy, warm instances should NOT be counted even if warm pool is enabled
    mockListRunners.mockResolvedValue([]);

    await adjust({ poolSize: 2 });

    expect(mockCountWarmInstances).not.toHaveBeenCalled();
    // Should need to top-up 2 instances (no warm counting)
    expect(mockFindAndStartWarmRunners).toHaveBeenCalledWith('my-org', 2, expect.any(Object), expect.anything());
  });
});
