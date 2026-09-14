import type { Octokit } from '@octokit/rest';
import { beforeEach, expect, it, vi } from 'vitest';

import { providerTypes } from '../test/compute-provider-contracts/provider-types';
import { defineScaleUpContractTests } from '../test/compute-provider-contracts/scale-up';
import * as ghAuth from '../github/auth';
import { controlPlaneProviderRegistry } from '../control-plane-providers';
import * as githubRunner from './github-runner';
import { scaleUp } from './scale-up';
import type { ActionRequestMessageSQS, ScaleUpComputeProvider } from './types';

vi.mock('../github/auth', () => ({
  createGithubAppAuth: vi.fn(),
  createGithubInstallationAuth: vi.fn(),
  createOctokitClient: vi.fn(),
}));

vi.mock('./github-runner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./github-runner')>()),
  getGitHubEnterpriseApiUrl: vi.fn(),
  getInstallationId: vi.fn(),
  isJobQueued: vi.fn(),
}));

const mockedAppAuth = vi.mocked(ghAuth.createGithubAppAuth);
const mockedInstallationAuth = vi.mocked(ghAuth.createGithubInstallationAuth);
const mockedCreateClient = vi.mocked(ghAuth.createOctokitClient);
const mockedResolveCapability = vi.spyOn(controlPlaneProviderRegistry, 'capability');

const githubClient = {} as Octokit;

const payloads: ActionRequestMessageSQS[] = [
  {
    id: 1,
    eventType: 'workflow_job',
    repositoryName: 'hello-world',
    repositoryOwner: 'Codertocat',
    installationId: 2,
    repoOwnerType: 'Organization',
    messageId: 'foobar',
  },
];

const cleanEnv = process.env;

const computeProviders = providerTypes.map((type) => ({
  provider: {
    type,
    resolveLabelsForRunners: vi.fn(),
    getCurrentRunners: vi.fn(),
    createRunners: vi.fn(),
  } satisfies ScaleUpComputeProvider,
  state: { computeProvider: type },
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
  vi.mocked(githubRunner.getInstallationId).mockResolvedValue(2);
  vi.mocked(githubRunner.isJobQueued).mockResolvedValue(true);
});

defineScaleUpContractTests({
  computeProviders,
  createPayloads: () => structuredClone(payloads),
  githubInstallationClient: githubClient,
  resolveCapability: mockedResolveCapability,
  scaleUp,
});

it('keeps mixed-org batches and maximum counts separate when multi-org is enabled', async () => {
  process.env.ENABLE_MULTI_ORG_RUNNERS = 'true';
  process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
  process.env.RUNNERS_MAXIMUM_COUNT = '2';
  const { provider, state } = computeProviders[0];
  mockedResolveCapability.mockReturnValue(() => provider);
  provider.resolveLabelsForRunners.mockResolvedValue({ state, runnerLabels: [] });
  provider.getCurrentRunners.mockImplementation(async (_state, { runnerOwner }) => (runnerOwner === 'org-a' ? 2 : 0));
  provider.createRunners.mockResolvedValue({
    instances: ['runner-b'],
    retryableErrorCount: 0,
    nonRetryableErrorCount: 0,
  });
  const messages = ['org-a', 'org-b'].map((org, i) => ({
    ...payloads[0],
    repositoryOwner: org,
    messageId: org,
    installationId: i + 10,
  }));
  expect(await scaleUp(messages)).toEqual([]);
  expect(provider.getCurrentRunners).toHaveBeenCalledWith(state, { runnerType: 'Org', runnerOwner: 'org-a' });
  expect(provider.getCurrentRunners).toHaveBeenCalledWith(state, { runnerType: 'Org', runnerOwner: 'org-b' });
  expect(provider.createRunners).toHaveBeenCalledTimes(1);
  expect(provider.createRunners).toHaveBeenCalledWith(
    expect.objectContaining({
      numberOfRunners: 1,
      githubRunnerConfig: expect.objectContaining({ runnerType: 'Org', runnerOwner: 'org-b' }),
    }),
  );
});
