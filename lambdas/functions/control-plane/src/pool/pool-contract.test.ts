import type { Octokit } from '@octokit/rest';
import type { ComputeProviderType } from '@aws-github-runner/compute-providers/provider-types';
import { beforeEach, vi } from 'vitest';

import { definePoolContractTests } from '../test/compute-provider-contracts/pool';
import { providerTypes } from '../test/compute-provider-contracts/provider-types';
import * as ghAuth from '../github/auth';
import { controlPlaneProviderRegistry } from '../control-plane-providers';
import * as githubRunner from '../scale-runners/github-runner';
import { adjust } from './pool';
import type { PoolComputeProvider } from './pool-provider';

vi.mock('../github/auth', () => ({
  createGithubAppAuth: vi.fn(),
  createGithubInstallationAuth: vi.fn(),
  createOctokitClient: vi.fn(),
  getStoredInstallationId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../scale-runners/github-runner', () => ({
  createStartRunnerConfig: vi.fn(),
  getGitHubEnterpriseApiUrl: vi.fn(),
}));

const mockedAppAuth = vi.mocked(ghAuth.createGithubAppAuth);
const mockedInstallationAuth = vi.mocked(ghAuth.createGithubInstallationAuth);
const mockedCreateClient = vi.mocked(ghAuth.createOctokitClient);
const mockedResolveCapability = vi.spyOn(controlPlaneProviderRegistry, 'capability');

const githubClient = {
  actions: { listSelfHostedRunnersForOrg: vi.fn() },
  apps: { getOrgInstallation: vi.fn() },
  paginate: vi.fn(),
} as unknown as Octokit;

const cleanEnv = process.env;

const computeProviders = providerTypes.map((type) => ({
  provider: {
    type,
    listRunners: vi.fn(),
    countAvailableRunners: vi.fn(),
    createRunners: vi.fn(),
  } satisfies PoolComputeProvider,
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...cleanEnv };
  process.env.SSM_TOKEN_PATH = '/github-action-runners/default/runners/tokens';
  process.env.SSM_CONFIG_PATH = '/github-action-runners/default/runners/config';
  process.env.PARAMETER_GITHUB_APP_ID_NAME = 'github-app-id';
  process.env.PARAMETER_GITHUB_APP_KEY_BASE64_NAME = 'github-app-key';

  mockedAppAuth.mockResolvedValue({ type: 'app', token: 'app-token', appId: 1, expiresAt: 'some-date' });
  mockedInstallationAuth.mockResolvedValue({
    type: 'token',
    tokenType: 'installation',
    token: 'installation-token',
    createdAt: 'some-date',
    expiresAt: 'some-date',
    permissions: {},
    repositorySelection: 'selected',
    installationId: 2,
  });
  mockedCreateClient.mockResolvedValue(githubClient);
  vi.mocked(githubRunner.getGitHubEnterpriseApiUrl).mockReturnValue({ ghesApiUrl: '', ghesBaseUrl: '' });
  vi.mocked(githubClient.apps.getOrgInstallation).mockResolvedValue({ data: { id: 2 } } as never);
  vi.mocked(githubClient.paginate).mockResolvedValue([]);
});

definePoolContractTests<ComputeProviderType>({
  adjust,
  computeProviders,
  githubInstallationClient: githubClient,
  resolveCapability: mockedResolveCapability,
});
