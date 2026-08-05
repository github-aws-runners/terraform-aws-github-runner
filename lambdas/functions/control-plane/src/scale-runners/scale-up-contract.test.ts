import type { Octokit } from '@octokit/rest';
import { beforeEach, vi } from 'vitest';

import { providerTypes } from '../test/runner-provider-contracts/provider-types';
import { defineScaleUpContractTests } from '../test/runner-provider-contracts/scale-up';
import * as ghAuth from '../github/auth';
import { controlPlaneProviderRegistry } from '../control-plane-providers';
import * as githubRunner from './github-runner';
import { scaleUp } from './scale-up';
import type { ActionRequestMessageSQS, ScaleUpRunnerProvider } from './types';

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

const lanes = providerTypes.map((type) => ({
  provider: {
    type,
    resolveLabelsForRunners: vi.fn(),
    getCurrentRunners: vi.fn(),
    createRunners: vi.fn(),
  } satisfies ScaleUpRunnerProvider,
  state: { lane: type },
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
  vi.mocked(githubRunner.getInstallationId).mockResolvedValue(2);
  vi.mocked(githubRunner.isJobQueued).mockResolvedValue(true);
});

defineScaleUpContractTests({
  createPayloads: () => structuredClone(payloads),
  githubInstallationClient: githubClient,
  lanes,
  resolveCapability: mockedResolveCapability,
  scaleUp,
});
