import { createCommonStorage, type GitHubAppCredentialsStore } from '@aws-github-runner/storage-providers';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createThrottleOptions, resetAppCredentialsCache, createRunnerInstallationClient } from './github-app-client';
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

describe('multi-App installation clients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAppCredentialsCache();
    mockedCreateCommonStorage.mockReturnValue({ githubAppCredentials: credentialsStore });
    setupAuthMocks();
  });

  it('creates an organization installation client for scheduled registration cleanup', async () => {
    mockApps.getOrgInstallation.mockResolvedValue({ data: { id: 999 } });
    const client = await createRunnerInstallationClient('test-org', 'Org', '');
    expect(client.actions).toBe(mockActions);
    expect(mockApps.getOrgInstallation).toHaveBeenCalledWith({ org: 'test-org' });
    expect(mockCreateAppAuth).toHaveBeenCalledWith({
      appId: 12345,
      privateKey: 'fake-private-key',
      installationId: 999,
    });
  });

  it('uses additional credentials and keeps App and installation auth paired', async () => {
    mockGetCredentials.mockResolvedValue([
      { appId: 1, privateKey: 'one' },
      { appId: 2, privateKey: 'two' },
    ]);
    mockApps.getOrgInstallation.mockResolvedValue({ data: { id: 222 } });
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    try {
      await createRunnerInstallationClient('test-org', 'Org', '');
      expect(mockCreateAppAuth).toHaveBeenNthCalledWith(1, { appId: 2, privateKey: 'two' });
      expect(mockCreateAppAuth).toHaveBeenNthCalledWith(2, { appId: 2, privateKey: 'two', installationId: 222 });
    } finally {
      random.mockRestore();
    }
  });

  it('selects another App after an exhausted installation response', async () => {
    mockGetCredentials.mockResolvedValue([
      { appId: 1, privateKey: 'one' },
      { appId: 2, privateKey: 'two' },
    ]);
    mockApps.getOrgInstallation.mockResolvedValue({ data: { id: 222 } });
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      await createRunnerInstallationClient('test-org', 'Org', '');
      mockHookAfter.mock.calls[0][1]({ headers: { 'x-ratelimit-remaining': '0' } });
      mockCreateAppAuth.mockClear();
      await createRunnerInstallationClient('test-org', 'Org', '');
      expect(mockCreateAppAuth).toHaveBeenNthCalledWith(1, { appId: 2, privateKey: 'two' });
    } finally {
      random.mockRestore();
    }
  });

  it('skips an App in secondary-limit cooldown', async () => {
    mockGetCredentials.mockResolvedValue([
      { appId: 1, privateKey: 'one' },
      { appId: 2, privateKey: 'two' },
    ]);
    mockApps.getOrgInstallation.mockResolvedValue({ data: { id: 222 } });
    createThrottleOptions(1).onSecondaryRateLimit(60, { method: 'GET', url: '/runners' } as Required<EndpointDefaults>);
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      await createRunnerInstallationClient('test-org', 'Org', '');
      expect(mockCreateAppAuth).toHaveBeenNthCalledWith(1, { appId: 2, privateKey: 'two' });
    } finally {
      random.mockRestore();
    }
  });

  it('tries another configured App when installation authentication fails', async () => {
    mockGetCredentials.mockResolvedValue([
      { appId: 1, privateKey: 'one' },
      { appId: 2, privateKey: 'two' },
    ]);
    mockApps.getOrgInstallation
      .mockRejectedValueOnce(new Error('not installed'))
      .mockResolvedValue({ data: { id: 222 } });
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      await createRunnerInstallationClient('test-org', 'Org', '');
      expect(mockCreateAppAuth).toHaveBeenLastCalledWith({ appId: 2, privateKey: 'two', installationId: 222 });
    } finally {
      random.mockRestore();
    }
  });
  it('reuses a selected App client within one invocation, while still switching exhausted Apps', async () => {
    mockGetCredentials.mockResolvedValue([
      { appId: 1, privateKey: 'one' },
      { appId: 2, privateKey: 'two' },
    ]);
    mockApps.getOrgInstallation.mockResolvedValue({ data: { id: 222 } });
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const clients = new Map();
    try {
      const first = await createRunnerInstallationClient('test-org', 'Org', '', clients);
      // Unknown budgets tie; with the same selection, the client is reused.
      expect(await createRunnerInstallationClient('test-org', 'Org', '', clients)).toBe(first);
      expect(mockCreateAppAuth).toHaveBeenCalledTimes(2);
      mockHookAfter.mock.calls[0][1]({ headers: { 'x-ratelimit-remaining': '0' } });
      const second = await createRunnerInstallationClient('test-org', 'Org', '', clients);
      expect(await createRunnerInstallationClient('test-org', 'Org', '', clients)).toBe(second);
      expect(mockCreateAppAuth).toHaveBeenCalledTimes(4);
      expect(mockApps.getOrgInstallation).toHaveBeenCalledTimes(2);
      await createRunnerInstallationClient('test-org', 'Org', '', new Map());
      expect(mockCreateAppAuth).toHaveBeenCalledTimes(6);
    } finally {
      random.mockRestore();
    }
  });

  it('separates cached clients by owner, runner type, and GHES endpoint', async () => {
    mockApps.getOrgInstallation.mockResolvedValue({ data: { id: 222 } });
    mockApps.getRepoInstallation.mockResolvedValue({ data: { id: 333 } });
    const clients = new Map();
    await createRunnerInstallationClient('owner', 'Org', '', clients);
    await createRunnerInstallationClient('other', 'Org', '', clients);
    await createRunnerInstallationClient('owner/repo', 'Repo', '', clients);
    await createRunnerInstallationClient('owner', 'Org', 'https://ghe.example/api/v3', clients);
    expect(clients.size).toBe(4);
    expect(mockCreateAppAuth).toHaveBeenCalledTimes(8);
  });

  it('does not cache failed authentication', async () => {
    const clients = new Map();
    mockApps.getOrgInstallation
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValue({ data: { id: 222 } });
    await expect(createRunnerInstallationClient('owner', 'Org', '', clients)).rejects.toThrow('unavailable');
    expect(clients.size).toBe(0);
    await createRunnerInstallationClient('owner', 'Org', '', clients);
    expect(clients.size).toBe(1);
  });
});
