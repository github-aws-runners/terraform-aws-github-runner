import { request } from '@octokit/request';
import { Instance } from '@aws-sdk/client-ec2';
import { createCommonStorage, type GitHubAppCredentialsStore } from '@aws-github-runner/storage-providers';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { deregisterRunner, handleDeregisterRetry, createThrottleOptions, resetAppCredentialsCache } from './deregister';
import { Config } from './ConfigResolver';
import type { EndpointDefaults } from '@octokit/types';

vi.mock('@aws-github-runner/storage-providers', () => ({
  createCommonStorage: vi.fn(),
}));

const mockedCreateCommonStorage = vi.mocked(createCommonStorage);
const mockGetCredentials = vi.fn<GitHubAppCredentialsStore['get']>();
const credentialsStore = { get: mockGetCredentials } satisfies GitHubAppCredentialsStore;

const mockCreateAppAuth = vi.fn();
vi.mock('@octokit/auth-app', () => ({
  createAppAuth: (...args: unknown[]) => mockCreateAppAuth(...args),
}));

const mockSqsSend = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: class {
    send = mockSqsSend;
  },
  SendMessageCommand: class {
    constructor(public input: unknown) {}
  },
}));

const mockPaginate = {
  iterator: vi.fn(),
};

const mockActions = {
  listSelfHostedRunnersForOrg: vi.fn(),
  listSelfHostedRunnersForRepo: vi.fn(),
  deleteSelfHostedRunnerFromOrg: vi.fn(),
  deleteSelfHostedRunnerFromRepo: vi.fn(),
};

const mockApps = {
  getOrgInstallation: vi.fn(),
  getRepoInstallation: vi.fn(),
};

const mockHookAfter = vi.fn();

const mockOctokitOptions = vi.fn();
function MockOctokit(options: unknown) {
  mockOctokitOptions(options);
  return {
    hook: { after: mockHookAfter },
    actions: mockActions,
    apps: mockApps,
    paginate: mockPaginate,
  };
}
MockOctokit.plugin = vi.fn().mockReturnValue(MockOctokit);

vi.mock('@octokit/rest', () => ({
  Octokit: MockOctokit,
}));

vi.mock('@octokit/plugin-throttling', () => ({
  throttling: vi.fn(),
}));

vi.mock('@octokit/request', () => ({
  request: {
    defaults: vi.fn().mockReturnValue(vi.fn()),
  },
}));

const baseConfig: Config = {
  createSpotWarningMetric: false,
  createSpotTerminationMetric: true,
  tagFilters: { 'ghr:environment': 'test' },
  prefix: 'runners',
  enableRunnerDeregistration: true,
  ghesApiUrl: '',
};

const orgInstance: Instance = {
  InstanceId: 'i-12345678901234567',
  InstanceType: 't2.micro',
  Tags: [
    { Key: 'Name', Value: 'test-instance' },
    { Key: 'ghr:environment', Value: 'test' },
    { Key: 'ghr:Owner', Value: 'test-org' },
    { Key: 'ghr:Type', Value: 'Org' },
  ],
  State: { Name: 'running' },
  LaunchTime: new Date('2021-01-01'),
};

const repoInstance: Instance = {
  InstanceId: 'i-repo12345678901234',
  InstanceType: 't2.micro',
  Tags: [
    { Key: 'Name', Value: 'test-repo-instance' },
    { Key: 'ghr:environment', Value: 'test' },
    { Key: 'ghr:Owner', Value: 'test-org/test-repo' },
    { Key: 'ghr:Type', Value: 'Repo' },
  ],
  State: { Name: 'running' },
  LaunchTime: new Date('2021-01-01'),
};

function setupAuthMocks() {
  mockGetCredentials.mockResolvedValue([{ appId: 12345, privateKey: 'fake-private-key' }]);

  // App auth returns app token
  const mockAuth = vi.fn();
  mockAuth.mockImplementation((opts: { type: string }) => {
    if (opts.type === 'app') {
      return Promise.resolve({ token: 'app-token' });
    }
    return Promise.resolve({ token: 'installation-token' });
  });
  mockCreateAppAuth.mockReturnValue(mockAuth);
}

describe('deregisterRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAppCredentialsCache();
    mockedCreateCommonStorage.mockReturnValue({ githubAppCredentials: credentialsStore });
    setupAuthMocks();
  });

  it('preserves the GHES endpoint for additional-App SQS retries', async () => {
    const endpoint = 'https://github.example.com/api/v3';
    vi.stubEnv('GHES_URL', endpoint);
    mockGetCredentials.mockResolvedValue([
      { appId: 1, privateKey: 'one' },
      { appId: 2, privateKey: 'two' },
    ]);
    mockApps.getOrgInstallation.mockResolvedValue({ data: { id: 222 } });
    mockPaginate.iterator.mockReturnValue(
      (async function* () {
        yield { data: [{ id: 42, name: `runner-${orgInstance.InstanceId}` }] };
      })(),
    );
    mockActions.deleteSelfHostedRunnerFromOrg.mockResolvedValue({});
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    try {
      await handleDeregisterRetry('queue', {
        instanceId: orgInstance.InstanceId!,
        owner: 'test-org',
        runnerType: 'Org',
        runnerId: 0,
        retryCount: 1,
      });
      expect(request.defaults).toHaveBeenCalledTimes(2);
      expect(request.defaults).toHaveBeenNthCalledWith(1, { baseUrl: endpoint });
      expect(request.defaults).toHaveBeenNthCalledWith(2, { baseUrl: endpoint });
      const configuredRequest = vi.mocked(request.defaults).mock.results[0].value;
      expect(mockCreateAppAuth).toHaveBeenNthCalledWith(1, { appId: 2, privateKey: 'two', request: configuredRequest });
      expect(mockCreateAppAuth).toHaveBeenNthCalledWith(2, {
        appId: 2,
        privateKey: 'two',
        installationId: 222,
        request: configuredRequest,
      });
      expect(mockOctokitOptions).toHaveBeenCalledTimes(2);
      for (const [options] of mockOctokitOptions.mock.calls)
        expect(options).toEqual(expect.objectContaining({ baseUrl: endpoint }));
      expect(mockActions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledWith({ org: 'test-org', runner_id: 42 });
    } finally {
      random.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it('deregisters through an additional App when it is selected', async () => {
    mockGetCredentials.mockResolvedValue([
      { appId: 1, privateKey: 'one' },
      { appId: 2, privateKey: 'two' },
    ]);
    mockApps.getOrgInstallation.mockResolvedValue({ data: { id: 222 } });
    mockPaginate.iterator.mockReturnValue(
      (async function* () {
        yield { data: [{ id: 42, name: `runner-${orgInstance.InstanceId}` }] };
      })(),
    );
    mockActions.deleteSelfHostedRunnerFromOrg.mockResolvedValue({});
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    try {
      await deregisterRunner(orgInstance, baseConfig);
      expect(mockCreateAppAuth).toHaveBeenCalledWith({ appId: 2, privateKey: 'two', installationId: 222 });
      expect(mockActions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledWith({ org: 'test-org', runner_id: 42 });
    } finally {
      random.mockRestore();
    }
  });

  it('should skip deregistration when disabled', async () => {
    await deregisterRunner(orgInstance, { ...baseConfig, enableRunnerDeregistration: false });
    expect(mockGetCredentials).not.toHaveBeenCalled();
  });

  it('should skip deregistration when instance ID is missing', async () => {
    const instance: Instance = { ...orgInstance, InstanceId: undefined };
    await deregisterRunner(instance, baseConfig);
    expect(mockGetCredentials).not.toHaveBeenCalled();
  });

  it('should skip deregistration when ghr:Owner tag is missing', async () => {
    const instance: Instance = {
      ...orgInstance,
      Tags: [{ Key: 'Name', Value: 'test' }],
    };
    await deregisterRunner(instance, baseConfig);
    // Auth should not be called since we bail early
    expect(mockCreateAppAuth).not.toHaveBeenCalled();
  });

  it('should deregister an org runner successfully', async () => {
    mockApps.getOrgInstallation.mockResolvedValue({ data: { id: 999 } });

    async function* fakeIterator() {
      yield { data: [{ id: 42, name: `runner-i-12345678901234567` }] };
    }
    mockPaginate.iterator.mockReturnValue(fakeIterator());

    mockActions.deleteSelfHostedRunnerFromOrg.mockResolvedValue({});

    await deregisterRunner(orgInstance, baseConfig);

    expect(mockApps.getOrgInstallation).toHaveBeenCalledWith({ org: 'test-org' });
    expect(mockActions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledWith({
      org: 'test-org',
      runner_id: 42,
    });
  });

  it('should deregister a repo runner successfully', async () => {
    mockApps.getRepoInstallation.mockResolvedValue({ data: { id: 888 } });

    async function* fakeIterator() {
      yield { data: [{ id: 55, name: `runner-i-repo12345678901234` }] };
    }
    mockPaginate.iterator.mockReturnValue(fakeIterator());

    mockActions.deleteSelfHostedRunnerFromRepo.mockResolvedValue({});

    await deregisterRunner(repoInstance, baseConfig);

    expect(mockApps.getRepoInstallation).toHaveBeenCalledWith({ owner: 'test-org', repo: 'test-repo' });
    expect(mockActions.deleteSelfHostedRunnerFromRepo).toHaveBeenCalledWith({
      owner: 'test-org',
      repo: 'test-repo',
      runner_id: 55,
    });
  });

  it('should handle runner not found gracefully', async () => {
    mockApps.getOrgInstallation.mockResolvedValue({ data: { id: 999 } });

    async function* fakeIterator() {
      yield { data: [{ id: 42, name: 'runner-other-instance' }] };
    }
    mockPaginate.iterator.mockReturnValue(fakeIterator());

    await deregisterRunner(orgInstance, baseConfig);

    expect(mockActions.deleteSelfHostedRunnerFromOrg).not.toHaveBeenCalled();
  });

  it('should handle GitHub API errors gracefully', async () => {
    mockApps.getOrgInstallation.mockRejectedValue(new Error('GitHub API error'));

    await deregisterRunner(orgInstance, baseConfig);

    // Should not throw — error is caught internally
    expect(mockActions.deleteSelfHostedRunnerFromOrg).not.toHaveBeenCalled();
  });

  it('should reload app credentials after a transient storage provider error', async () => {
    mockGetCredentials
      .mockRejectedValueOnce(new Error('Transient credential storage error'))
      .mockResolvedValue([{ appId: 12345, privateKey: 'fake-private-key' }]);
    mockApps.getOrgInstallation.mockResolvedValue({ data: { id: 999 } });

    async function* fakeIterator() {
      yield { data: [{ id: 42, name: `runner-i-12345678901234567` }] };
    }
    mockPaginate.iterator.mockReturnValue(fakeIterator());
    mockActions.deleteSelfHostedRunnerFromOrg.mockResolvedValue({});

    await deregisterRunner(orgInstance, baseConfig);
    await deregisterRunner(orgInstance, baseConfig);

    expect(mockGetCredentials).toHaveBeenCalledTimes(2);
    expect(mockActions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledTimes(1);
    expect(mockActions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledWith({
      org: 'test-org',
      runner_id: 42,
    });
  });

  it('should default to Org runner type when ghr:Type tag is missing', async () => {
    const instance: Instance = {
      ...orgInstance,
      Tags: [
        { Key: 'ghr:environment', Value: 'test' },
        { Key: 'ghr:Owner', Value: 'test-org' },
      ],
    };

    mockApps.getOrgInstallation.mockResolvedValue({ data: { id: 999 } });

    async function* fakeIterator() {
      yield { data: [{ id: 42, name: `runner-i-12345678901234567` }] };
    }
    mockPaginate.iterator.mockReturnValue(fakeIterator());

    mockActions.deleteSelfHostedRunnerFromOrg.mockResolvedValue({});

    await deregisterRunner(instance, baseConfig);

    expect(mockApps.getOrgInstallation).toHaveBeenCalledWith({ org: 'test-org' });
    expect(mockActions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledWith({
      org: 'test-org',
      runner_id: 42,
    });
  });

  it('should use GHES API URL when configured', async () => {
    const ghesConfig = { ...baseConfig, ghesApiUrl: 'https://github.internal.co/api/v3' };

    mockApps.getOrgInstallation.mockResolvedValue({ data: { id: 999 } });

    async function* fakeIterator() {
      yield { data: [{ id: 42, name: `runner-i-12345678901234567` }] };
    }
    mockPaginate.iterator.mockReturnValue(fakeIterator());

    mockActions.deleteSelfHostedRunnerFromOrg.mockResolvedValue({});

    await deregisterRunner(orgInstance, ghesConfig);

    expect(mockActions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalled();
  });

  it('should paginate through multiple pages to find runner', async () => {
    mockApps.getOrgInstallation.mockResolvedValue({ data: { id: 999 } });

    async function* fakeIterator() {
      yield { data: [{ id: 1, name: 'runner-other-1' }] };
      yield { data: [{ id: 2, name: 'runner-other-2' }] };
      yield { data: [{ id: 42, name: `runner-i-12345678901234567` }] };
    }
    mockPaginate.iterator.mockReturnValue(fakeIterator());

    mockActions.deleteSelfHostedRunnerFromOrg.mockResolvedValue({});

    await deregisterRunner(orgInstance, baseConfig);

    expect(mockActions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledWith({
      org: 'test-org',
      runner_id: 42,
    });
  });

  it('should handle repo runner not found gracefully', async () => {
    mockApps.getRepoInstallation.mockResolvedValue({ data: { id: 888 } });

    async function* fakeIterator() {
      yield { data: [{ id: 99, name: 'runner-other-instance' }] };
    }
    mockPaginate.iterator.mockReturnValue(fakeIterator());

    await deregisterRunner(repoInstance, baseConfig);

    expect(mockActions.deleteSelfHostedRunnerFromRepo).not.toHaveBeenCalled();
  });

  it('should handle instance with no tags', async () => {
    const instance: Instance = {
      InstanceId: 'i-12345678901234567',
      Tags: undefined,
    };
    await deregisterRunner(instance, baseConfig);
    expect(mockCreateAppAuth).not.toHaveBeenCalled();
  });
});

describe('deregisterRunner exact-name lookup (ghr:runner_name_prefix present)', () => {
  const prefixedOrgInstance: Instance = {
    ...orgInstance,
    Tags: [...(orgInstance.Tags ?? []), { Key: 'ghr:runner_name_prefix', Value: 'runners-x64_' }],
  };
  const prefixedRepoInstance: Instance = {
    ...repoInstance,
    Tags: [...(repoInstance.Tags ?? []), { Key: 'ghr:runner_name_prefix', Value: 'repo-runner-' }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetAppCredentialsCache();
    mockedCreateCommonStorage.mockReturnValue({ githubAppCredentials: credentialsStore });
    setupAuthMocks();
  });

  it('should look up an org runner by exact name with a single request and delete it', async () => {
    mockApps.getOrgInstallation.mockResolvedValue({ data: { id: 999 } });
    mockActions.listSelfHostedRunnersForOrg.mockResolvedValue({
      data: { total_count: 1, runners: [{ id: 42, name: 'runners-x64_i-12345678901234567' }] },
    });
    mockActions.deleteSelfHostedRunnerFromOrg.mockResolvedValue({});

    await deregisterRunner(prefixedOrgInstance, baseConfig);

    expect(mockActions.listSelfHostedRunnersForOrg).toHaveBeenCalledTimes(1);
    expect(mockActions.listSelfHostedRunnersForOrg).toHaveBeenCalledWith({
      org: 'test-org',
      name: 'runners-x64_i-12345678901234567',
      per_page: 1,
    });
    expect(mockPaginate.iterator).not.toHaveBeenCalled();
    expect(mockActions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledWith({ org: 'test-org', runner_id: 42 });
  });

  it('should look up a repo runner by exact name with a single request and delete it', async () => {
    mockApps.getRepoInstallation.mockResolvedValue({ data: { id: 888 } });
    mockActions.listSelfHostedRunnersForRepo.mockResolvedValue({
      data: { total_count: 1, runners: [{ id: 55, name: 'repo-runner-i-repo12345678901234' }] },
    });
    mockActions.deleteSelfHostedRunnerFromRepo.mockResolvedValue({});

    await deregisterRunner(prefixedRepoInstance, baseConfig);

    expect(mockActions.listSelfHostedRunnersForRepo).toHaveBeenCalledWith({
      owner: 'test-org',
      repo: 'test-repo',
      name: 'repo-runner-i-repo12345678901234',
      per_page: 1,
    });
    expect(mockPaginate.iterator).not.toHaveBeenCalled();
    expect(mockActions.deleteSelfHostedRunnerFromRepo).toHaveBeenCalledWith({
      owner: 'test-org',
      repo: 'test-repo',
      runner_id: 55,
    });
  });

  it('should scan for legacy registrations when the exact name is not registered', async () => {
    mockApps.getOrgInstallation.mockResolvedValue({ data: { id: 999 } });
    mockActions.listSelfHostedRunnersForOrg.mockResolvedValue({ data: { total_count: 0, runners: [] } });

    mockPaginate.iterator.mockReturnValue(
      (async function* () {
        yield { data: [] };
      })(),
    );

    await deregisterRunner(prefixedOrgInstance, baseConfig);

    expect(mockActions.listSelfHostedRunnersForOrg).toHaveBeenCalledTimes(1);
    expect(mockPaginate.iterator).toHaveBeenCalledTimes(1);
    expect(mockActions.deleteSelfHostedRunnerFromOrg).not.toHaveBeenCalled();
  });

  it('should ignore a runner whose name does not exactly match', async () => {
    mockApps.getOrgInstallation.mockResolvedValue({ data: { id: 999 } });
    mockActions.listSelfHostedRunnersForOrg.mockResolvedValue({
      data: { total_count: 1, runners: [{ id: 7, name: 'runners-x64_i-12345678901234567-other' }] },
    });

    mockPaginate.iterator.mockReturnValue(
      (async function* () {
        yield { data: [] };
      })(),
    );

    await deregisterRunner(prefixedOrgInstance, baseConfig);

    expect(mockActions.deleteSelfHostedRunnerFromOrg).not.toHaveBeenCalled();
  });
});

describe('createThrottleOptions', () => {
  it('should return false for rate limit and log warning', () => {
    const options = createThrottleOptions();
    const endpointDefaults = { method: 'GET', url: '/test' } as Required<EndpointDefaults>;

    expect(options.onRateLimit(60, endpointDefaults)).toBe(false);
    expect(options.onSecondaryRateLimit(60, endpointDefaults)).toBe(false);
  });
});

describe('recorded runner IDs and SQS retries', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    MockOctokit.plugin.mockReturnValue(MockOctokit);
    resetAppCredentialsCache();
    mockedCreateCommonStorage.mockReturnValue({ githubAppCredentials: credentialsStore });
    setupAuthMocks();
    mockApps.getOrgInstallation.mockResolvedValue({ data: { id: 999 } });
    mockApps.getRepoInstallation.mockResolvedValue({ data: { id: 888 } });
    mockSqsSend.mockResolvedValue({});
    vi.stubEnv('DEREGISTER_RETRY_QUEUE_URL', 'queue');
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([orgInstance, repoInstance])(
    'deletes a recorded ID despite an overridden prefix ($InstanceId)',
    async (instance) => {
      await deregisterRunner(
        {
          ...instance,
          Tags: [
            ...instance.Tags!,
            { Key: 'ghr:runner_name_prefix', Value: 'wrong-' },
            { Key: 'ghr:github_runner_id', Value: '42' },
          ],
        },
        baseConfig,
      );
      const deletion =
        instance === orgInstance
          ? mockActions.deleteSelfHostedRunnerFromOrg
          : mockActions.deleteSelfHostedRunnerFromRepo;
      expect(deletion).toHaveBeenCalledWith(expect.objectContaining({ runner_id: 42 }));
      expect(mockPaginate.iterator).not.toHaveBeenCalled();
      expect(mockActions.listSelfHostedRunnersForOrg).not.toHaveBeenCalled();
      expect(mockActions.listSelfHostedRunnersForRepo).not.toHaveBeenCalled();
    },
  );

  it.each(['', 'invalid', '0', '-1', '1.5', '9007199254740992'])(
    'falls back for invalid recorded ID %s and a mismatched JIT prefix',
    async (id) => {
      mockActions.listSelfHostedRunnersForOrg.mockResolvedValue({ data: { runners: [] } });
      mockPaginate.iterator.mockReturnValue(
        (async function* () {
          yield { data: [{ id: 42, name: `jit-${orgInstance.InstanceId}` }] };
        })(),
      );
      await deregisterRunner(
        {
          ...orgInstance,
          Tags: [
            ...orgInstance.Tags!,
            { Key: 'ghr:runner_name_prefix', Value: 'tag-' },
            { Key: 'ghr:github_runner_id', Value: id },
          ],
        },
        baseConfig,
      );
      expect(mockActions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledWith({ org: 'test-org', runner_id: 42 });
    },
  );

  it('carries an exact-name result through busy retries without further lookups', async () => {
    mockActions.listSelfHostedRunnersForOrg.mockResolvedValue({
      data: { runners: [{ id: 42, name: orgInstance.InstanceId }] },
    });
    mockActions.deleteSelfHostedRunnerFromOrg.mockRejectedValueOnce(Object.assign(new Error('busy'), { status: 422 }));
    await deregisterRunner(
      { ...orgInstance, Tags: [...orgInstance.Tags!, { Key: 'ghr:runner_name_prefix', Value: '' }] },
      baseConfig,
    );
    const message = JSON.parse(mockSqsSend.mock.calls[0][0].input.MessageBody);
    expect(message).toMatchObject({ runnerId: 42, retryCount: 0 });
    mockActions.deleteSelfHostedRunnerFromOrg.mockRejectedValueOnce(Object.assign(new Error('busy'), { status: 422 }));
    await handleDeregisterRetry('queue', message);
    const next = JSON.parse(mockSqsSend.mock.calls[1][0].input.MessageBody);
    expect(next).toMatchObject({ runnerId: 42, retryCount: 1 });
    await handleDeregisterRetry('queue', next);
    expect(mockActions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledTimes(3);
    expect(mockActions.listSelfHostedRunnersForOrg).toHaveBeenCalledTimes(1);
    expect(mockPaginate.iterator).not.toHaveBeenCalled();
  });

  it.each([0, undefined])('upgrades a legacy retry with ID %s after finding a busy runner', async (runnerId) => {
    mockPaginate.iterator.mockReturnValue(
      (async function* () {
        yield { data: [{ id: 55, name: repoInstance.InstanceId }] };
      })(),
    );
    mockActions.deleteSelfHostedRunnerFromRepo.mockRejectedValueOnce(Object.assign(new Error('busy'), { status: 422 }));
    await handleDeregisterRetry('queue', {
      instanceId: repoInstance.InstanceId!,
      owner: 'test-org/test-repo',
      runnerType: 'Repo',
      runnerId,
      retryCount: 1,
    });
    const next = JSON.parse(mockSqsSend.mock.calls[0][0].input.MessageBody);
    expect(next).toMatchObject({ runnerId: 55, retryCount: 2 });
    await handleDeregisterRetry('queue', next);
    expect(mockPaginate.iterator).toHaveBeenCalledTimes(1);
    expect(mockActions.deleteSelfHostedRunnerFromRepo).toHaveBeenLastCalledWith({
      owner: 'test-org',
      repo: 'test-repo',
      runner_id: 55,
    });
  });

  it('treats an already removed recorded runner as success initially and on retry', async () => {
    mockActions.deleteSelfHostedRunnerFromOrg.mockRejectedValue(Object.assign(new Error('gone'), { status: 404 }));
    await deregisterRunner(
      { ...orgInstance, Tags: [...orgInstance.Tags!, { Key: 'ghr:github_runner_id', Value: '42' }] },
      baseConfig,
    );
    await expect(
      handleDeregisterRetry('queue', {
        instanceId: orgInstance.InstanceId!,
        owner: 'test-org',
        runnerType: 'Org',
        runnerId: 42,
        retryCount: 0,
      }),
    ).resolves.toBeUndefined();
    expect(mockSqsSend).not.toHaveBeenCalled();
    expect(mockPaginate.iterator).not.toHaveBeenCalled();
  });

  it.each([403, 500])('propagates retry API error %s for SQS redelivery', async (status) => {
    const error = Object.assign(new Error('API failure'), { status });
    mockActions.deleteSelfHostedRunnerFromOrg.mockRejectedValue(error);
    await expect(
      handleDeregisterRetry('queue', {
        instanceId: orgInstance.InstanceId!,
        owner: 'test-org',
        runnerType: 'Org',
        runnerId: 42,
        retryCount: 0,
      }),
    ).rejects.toBe(error);
    expect(mockSqsSend).not.toHaveBeenCalled();
    expect(mockPaginate.iterator).not.toHaveBeenCalled();
  });
});
