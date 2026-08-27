import type { Octokit } from '@octokit/rest';
import { defaultComputeProvider } from '@aws-github-runner/compute-providers/provider-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as ghAuth from '../github/auth';
import { controlPlaneProviderRegistry } from '../control-plane-providers';
import * as githubRunner from '../scale-runners/github-runner';
import { adjust } from './pool';
import type { PoolComputeProvider } from './pool-provider';

const githubClient = {
  paginate: vi.fn(),
  actions: {
    listSelfHostedRunnersForOrg: vi.fn(),
  },
  apps: {
    getOrgInstallation: vi.fn(),
  },
};

vi.mock('../github/auth', () => ({
  createGithubAppAuth: vi.fn(),
  createGithubInstallationAuth: vi.fn(),
  createOctokitClient: vi.fn(),
  getStoredInstallationId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../scale-runners/github-runner', () => ({
  createStartRunnerConfig: vi.fn(),
  getGitHubEnterpriseApiUrl: vi.fn().mockReturnValue({
    ghesApiUrl: '',
    ghesBaseUrl: '',
  }),
  validateSsmParameterStoreTags: vi.fn().mockReturnValue([]),
}));

const mockedAppAuth = vi.mocked(ghAuth.createGithubAppAuth);
const mockedInstallationAuth = vi.mocked(ghAuth.createGithubInstallationAuth);
const mockedCreateClient = vi.mocked(ghAuth.createOctokitClient);
const mockedResolveCapability = vi.spyOn(controlPlaneProviderRegistry, 'capability');
const mockedGetGitHubEnterpriseApiUrl = vi.mocked(githubRunner.getGitHubEnterpriseApiUrl);

const poolProvider = {
  listRunners: vi.fn<PoolComputeProvider['listRunners']>(),
  countAvailableRunners: vi.fn<PoolComputeProvider['countAvailableRunners']>(),
  createRunners: vi.fn<PoolComputeProvider['createRunners']>(),
} satisfies Omit<PoolComputeProvider, 'type'>;

const cleanEnv = process.env;

const ORG = 'my-org';

const providerRunners = [{ id: 'runner-1' }, { id: 'runner-2' }, { id: 'runner-3' }, { id: 'runner-4' }];

const githubRunnersRegistered = [
  {
    id: 1,
    name: 'runner-1',
    os: 'linux',
    status: 'online',
    busy: false,
    labels: [],
  },
  {
    id: 2,
    name: 'runner-2',
    os: 'linux',
    status: 'online',
    busy: true,
    labels: [],
  },
  {
    id: 3,
    name: 'runner-3',
    os: 'linux',
    status: 'offline',
    busy: false,
    labels: [],
  },
  {
    id: 4,
    name: 'runner-4',
    os: 'linux',
    status: 'online',
    busy: false,
    labels: [],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...cleanEnv };
  process.env.RUNNERS_MAXIMUM_COUNT = '-1';
  process.env.ENVIRONMENT = 'unit-test-environment';
  process.env.SSM_TOKEN_PATH = '/github-action-runners/default/runners/tokens';
  process.env.RUNNER_OWNER = ORG;

  githubClient.paginate.mockResolvedValue(githubRunnersRegistered);
  githubClient.apps.getOrgInstallation.mockResolvedValue({ data: { id: 1 } });
  mockedGetGitHubEnterpriseApiUrl.mockReturnValue({ ghesApiUrl: '', ghesBaseUrl: '' });

  mockedResolveCapability.mockReturnValue(() => poolProvider);
  poolProvider.listRunners.mockResolvedValue(providerRunners);
  poolProvider.countAvailableRunners.mockReturnValue(2);
  poolProvider.createRunners.mockResolvedValue([]);

  mockedAppAuth.mockResolvedValue({
    type: 'app',
    token: 'token',
    appId: 1,
    expiresAt: 'some-date',
    appIndex: 0,
  });
  mockedInstallationAuth.mockResolvedValue({
    type: 'token',
    tokenType: 'installation',
    token: 'token',
    createdAt: 'some-date',
    expiresAt: 'some-date',
    permissions: {},
    repositorySelection: 'all',
    installationId: 0,
  });

  mockedCreateClient.mockResolvedValue(githubClient as unknown as Octokit);
});

describe('pool adjustment', () => {
  describe('With GitHub Cloud', () => {
    beforeEach(() => {
      mockedGetGitHubEnterpriseApiUrl.mockReturnValue({
        ghesApiUrl: '',
        ghesBaseUrl: '',
      });
    });

    it('tops up the pool to the requested size', async () => {
      await adjust({ poolSize: 3 });

      expect(poolProvider.createRunners).toHaveBeenCalledTimes(1);
      expect(poolProvider.createRunners).toHaveBeenCalledWith(expect.objectContaining({ numberOfRunners: 1 }));
    });

    it('uses the default provider for events without a provider type', async () => {
      await adjust({ poolSize: 10 });

      expect(mockedResolveCapability).toHaveBeenCalledWith(defaultComputeProvider, 'pool');
      expect(poolProvider.listRunners).toHaveBeenCalledWith({
        environment: 'unit-test-environment',
        runnerOwner: ORG,
        runnerType: 'Org',
      });
      expect(poolProvider.createRunners).toHaveBeenCalledWith(expect.objectContaining({ numberOfRunners: 8 }));
    });

    it('rejects unsupported provider types', async () => {
      await expect(adjust({ poolSize: 10, type: 'unsupported-provider' })).rejects.toThrow(
        "Unsupported compute provider type 'unsupported-provider'",
      );

      expect(poolProvider.listRunners).not.toHaveBeenCalled();
    });

    it('does not top up when the requested size is already available', async () => {
      await adjust({ poolSize: 1 });

      expect(poolProvider.createRunners).not.toHaveBeenCalled();
    });
  });

  describe('With GHES', () => {
    beforeEach(() => {
      mockedGetGitHubEnterpriseApiUrl.mockReturnValue({
        ghesApiUrl: 'https://api.github.enterprise.something',
        ghesBaseUrl: 'https://github.enterprise.something',
      });
    });

    it('passes the enterprise base URL when creating runners', async () => {
      await adjust({ poolSize: 5 });

      expect(poolProvider.createRunners).toHaveBeenCalledWith(
        expect.objectContaining({
          githubRunnerConfig: expect.objectContaining({
            ghesBaseUrl: 'https://github.enterprise.something',
          }),
          numberOfRunners: 3,
        }),
      );
    });
  });

  describe('With GitHub Data Residency', () => {
    beforeEach(() => {
      mockedGetGitHubEnterpriseApiUrl.mockReturnValue({
        ghesApiUrl: 'https://api.companyname.ghe.com',
        ghesBaseUrl: 'https://companyname.ghe.com',
      });
    });

    it('passes the data-residency base URL when creating runners', async () => {
      await adjust({ poolSize: 5 });

      expect(poolProvider.createRunners).toHaveBeenCalledWith(
        expect.objectContaining({
          githubRunnerConfig: expect.objectContaining({
            ghesBaseUrl: 'https://companyname.ghe.com',
          }),
          numberOfRunners: 3,
        }),
      );
    });
  });

  describe('With Runner Name Prefix', () => {
    beforeEach(() => {
      process.env.RUNNER_NAME_PREFIX = 'runner-prefix_';
    });

    it('removes the prefix from runner names before passing statuses to the provider', async () => {
      githubClient.paginate.mockResolvedValue([
        ...githubRunnersRegistered,
        {
          id: 5,
          name: 'runner-prefix_runner-5',
          os: 'linux',
          status: 'online',
          busy: false,
          labels: [],
        },
      ]);
      poolProvider.countAvailableRunners.mockReturnValue(4);

      await adjust({ poolSize: 5 });

      expect(poolProvider.countAvailableRunners).toHaveBeenCalledWith(providerRunners, expect.any(Map), false);
      const runnerStatuses = poolProvider.countAvailableRunners.mock.calls[0][1];
      expect(runnerStatuses.get('runner-5')).toEqual({ busy: false, status: 'online' });
      expect(runnerStatuses.has('runner-prefix_runner-5')).toBe(false);
      expect(poolProvider.createRunners).toHaveBeenCalledWith(expect.objectContaining({ numberOfRunners: 1 }));
    });
  });

  describe('Respecting runners_maximum_count', () => {
    beforeEach(() => {
      mockedGetGitHubEnterpriseApiUrl.mockReturnValue({
        ghesApiUrl: '',
        ghesBaseUrl: '',
      });
    });

    it('does not top up when the total number of runners is at the maximum', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '4';
      await adjust({ poolSize: 10 });

      expect(poolProvider.createRunners).not.toHaveBeenCalled();
    });

    it('does not top up when the total number of runners exceeds the maximum', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '3';
      await adjust({ poolSize: 10 });

      expect(poolProvider.createRunners).not.toHaveBeenCalled();
    });

    it('clamps the top-up to the remaining headroom under the maximum', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '6';
      await adjust({ poolSize: 10 });

      expect(poolProvider.createRunners).toHaveBeenCalledWith(expect.objectContaining({ numberOfRunners: 2 }));
    });

    it('tops up against the pool size when below the maximum headroom', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '6';
      await adjust({ poolSize: 3 });

      expect(poolProvider.createRunners).toHaveBeenCalledWith(expect.objectContaining({ numberOfRunners: 1 }));
    });

    it('ignores the maximum when set to -1', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '-1';
      await adjust({ poolSize: 10 });

      expect(poolProvider.createRunners).toHaveBeenCalledWith(expect.objectContaining({ numberOfRunners: 8 }));
    });
  });

  describe('With INCLUDE_BUSY_RUNNERS enabled', () => {
    beforeEach(() => {
      process.env.INCLUDE_BUSY_RUNNERS = 'true';
      poolProvider.countAvailableRunners.mockReturnValue(3);
    });

    it('does not top up when the provider reports that the requested size is available', async () => {
      await adjust({ poolSize: 3 });

      expect(poolProvider.countAvailableRunners).toHaveBeenCalledWith(providerRunners, expect.any(Map), true);
      expect(poolProvider.createRunners).not.toHaveBeenCalled();
    });

    it('tops up from the provider count that includes busy runners', async () => {
      await adjust({ poolSize: 5 });

      expect(poolProvider.countAvailableRunners).toHaveBeenCalledWith(providerRunners, expect.any(Map), true);
      expect(poolProvider.createRunners).toHaveBeenCalledWith(expect.objectContaining({ numberOfRunners: 2 }));
    });
  });

  describe('Multi-app round-robin', () => {
    beforeEach(() => {
      mockedGetGitHubEnterpriseApiUrl.mockReturnValue({
        ghesApiUrl: '',
        ghesBaseUrl: '',
      });
    });

    it('passes the same appIndex to createGithubInstallationAuth', async () => {
      mockedAppAuth.mockResolvedValue({
        type: 'app',
        token: 'token',
        appId: 42,
        expiresAt: 'some-date',
        appIndex: 1,
      });

      await adjust({ poolSize: 3 });

      expect(mockedInstallationAuth).toHaveBeenCalledWith(expect.any(Number), expect.any(String), 1);
    });

    it('looks up installationId using the selected app JWT', async () => {
      mockedAppAuth.mockResolvedValue({
        type: 'app',
        token: 'app-token-for-selected-app',
        appId: 42,
        expiresAt: 'some-date',
        appIndex: 1,
      });

      await adjust({ poolSize: 3 });

      expect(githubClient.apps.getOrgInstallation).toHaveBeenCalledWith({ org: ORG });
    });

    it('passes appIndex to the provider so rate-limit metrics use the selected app', async () => {
      mockedAppAuth.mockResolvedValue({
        type: 'app',
        token: 'token',
        appId: 42,
        expiresAt: 'some-date',
        appIndex: 2,
      });

      await adjust({ poolSize: 3 });

      expect(poolProvider.createRunners).toHaveBeenCalledWith(
        expect.objectContaining({
          githubRunnerConfig: expect.objectContaining({ appIndex: 2 }),
        }),
      );
    });
  });
});
