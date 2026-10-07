import { Instance } from '@aws-sdk/client-ec2';
import { createCommonStorage, type GitHubAppCredentialsStore } from '@aws-github-runner/storage-providers';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { deregisterRunner, createThrottleOptions, resetAppCredentialsCache } from './deregister';
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

function MockOctokit() {
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

describe('createThrottleOptions', () => {
  it('should return false for rate limit and log warning', () => {
    const options = createThrottleOptions();
    const endpointDefaults = { method: 'GET', url: '/test' } as Required<EndpointDefaults>;

    expect(options.onRateLimit(60, endpointDefaults)).toBe(false);
    expect(options.onSecondaryRateLimit(60, endpointDefaults)).toBe(false);
  });
});
