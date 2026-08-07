import type { Octokit } from '@octokit/rest';
import type { RunnerProviderType } from '@aws-github-runner/runner-providers/provider-types';
import { beforeEach, vi } from 'vitest';

import { definePoolContractTests } from '../test/runner-provider-contracts/pool';
import { providerTypes } from '../test/runner-provider-contracts/provider-types';
import * as ghAuth from '../github/auth';
import { controlPlaneProviderRegistry } from '../control-plane-providers';
import * as githubRunner from '../scale-runners/github-runner';
import { adjust } from './pool';
import type { PoolRunnerProvider } from './pool-provider';

vi.mock('../github/auth', () => ({
  createGithubAppAuth: vi.fn(),
  createGithubInstallationAuth: vi.fn(),
  createOctokitClient: vi.fn(),
}));

vi.mock('../scale-runners/github-runner', () => ({
  createStartRunnerConfig: vi.fn(),
  getGitHubEnterpriseApiUrl: vi.fn(),
  validateSsmParameterStoreTags: vi.fn(),
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

const lanes = providerTypes.map((type) => ({
  provider: {
    type,
    listRunners: vi.fn(),
    countAvailableRunners: vi.fn(),
    createRunners: vi.fn(),
  } satisfies PoolRunnerProvider,
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...cleanEnv };

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
  vi.mocked(githubRunner.validateSsmParameterStoreTags).mockReturnValue([]);
  vi.mocked(githubClient.apps.getOrgInstallation).mockResolvedValue({ data: { id: 2 } } as never);
  vi.mocked(githubClient.paginate).mockResolvedValue([]);
});

definePoolContractTests<RunnerProviderType>({
  adjust,
  githubInstallationClient: githubClient,
  lanes,
  resolveCapability: mockedResolveCapability,
});
