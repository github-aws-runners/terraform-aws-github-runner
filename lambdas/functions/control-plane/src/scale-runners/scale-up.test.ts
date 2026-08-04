import { Octokit } from '@octokit/rest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as ghAuth from '../github/auth';
import { createScaleUpRunnerProvider } from '../runner-provider-registry';
import { publishRetryMessage } from './job-retry';
import * as scaleUpModule from './scale-up';
import type { ActionRequestMessageSQS, CreateGitHubRunnerConfig } from './types';

vi.mock('../github/auth', () => ({
  createGithubAppAuth: vi.fn(),
  createGithubInstallationAuth: vi.fn(),
  createOctokitClient: vi.fn(),
  createEnterprisePATClient: vi.fn(),
}));

vi.mock('../runner-provider-registry', () => ({
  createScaleUpRunnerProvider: vi.fn(),
}));

vi.mock('./job-retry', () => ({
  publishRetryMessage: vi.fn(),
}));

const mockProvider = {
  type: 'ec2',
  prepareGroup: vi.fn(),
  getCurrentRunners: vi.fn(),
  createRunners: vi.fn(),
};

const mockOctokit = {
  actions: {
    getJobForWorkflowRun: vi.fn(),
  },
} as unknown as Octokit;

const mockedAppAuth = vi.mocked(ghAuth.createGithubAppAuth);
const mockedInstallationAuth = vi.mocked(ghAuth.createGithubInstallationAuth);
const mockedCreateClient = vi.mocked(ghAuth.createOctokitClient);
const mockedEnterprisePatClient = vi.mocked(ghAuth.createEnterprisePATClient);
const mockedCreateScaleUpRunnerProvider = vi.mocked(createScaleUpRunnerProvider);
const mockedPublishRetryMessage = vi.mocked(publishRetryMessage);
const cleanEnv = process.env;

const TEST_DATA: ActionRequestMessageSQS[] = [
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

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...cleanEnv };
  process.env.RUNNER_GROUP_NAME = 'Default';
  process.env.SSM_TOKEN_PATH = '/tokens';
  process.env.SSM_CONFIG_PATH = '/config';
  process.env.RUNNERS_MAXIMUM_COUNT = '3';
  mockProvider.prepareGroup.mockResolvedValue({ runnerLabels: [], state: { prepared: true } });
  mockProvider.getCurrentRunners.mockResolvedValue(0);
  mockProvider.createRunners.mockResolvedValue({
    instances: ['i-123'],
    retryableErrorCount: 0,
    nonRetryableErrorCount: 0,
  });
  mockedCreateScaleUpRunnerProvider.mockReturnValue(mockProvider as never);
  mockedAppAuth.mockResolvedValue({ token: 'app-token' } as never);
  mockedInstallationAuth.mockResolvedValue({ token: 'installation-token' } as never);
  mockedCreateClient.mockResolvedValue(mockOctokit);
  mockedEnterprisePatClient.mockResolvedValue(mockOctokit);
  (mockOctokit.actions.getJobForWorkflowRun as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { status: 'queued' },
    headers: {},
  });
});

describe('runner provider selection', () => {
  it('rejects unsupported scale-up provider types', async () => {
    process.env.RUNNER_PROVIDER_TYPE = 'microvm';

    await expect(scaleUpModule.scaleUp(TEST_DATA)).rejects.toThrow("Unsupported runner provider type 'microvm'");
    expect(mockedAppAuth).not.toHaveBeenCalled();
  });
});

describe('enterprise scale-up', () => {
  beforeEach(() => {
    process.env.RUNNER_REGISTRATION_LEVEL = 'enterprise';
    process.env.ENTERPRISE_SLUG = 'acme-enterprise';
    process.env.RUNNER_LABELS = 'base';
    process.env.GHES_URL = 'https://ghe.example.com';
  });

  it('uses PAT auth and skips GitHub App auth', async () => {
    await scaleUpModule.scaleUp(TEST_DATA);

    expect(mockedEnterprisePatClient).toHaveBeenCalledWith('https://ghe.example.com/api/v3');
    expect(mockedAppAuth).not.toHaveBeenCalled();
    expect(mockedInstallationAuth).not.toHaveBeenCalled();
  });

  it('passes enterprise owner and slug to the provider', async () => {
    await scaleUpModule.scaleUp(TEST_DATA);

    expect(mockProvider.getCurrentRunners).toHaveBeenCalledWith(
      { prepared: true },
      { runnerType: 'Enterprise', runnerOwner: 'acme-enterprise' },
    );

    const call = mockProvider.createRunners.mock.calls[0][0] as {
      githubRunnerConfig: CreateGitHubRunnerConfig;
      numberOfRunners: number;
      githubInstallationClient: Octokit;
      state: unknown;
    };

    expect(call.githubRunnerConfig.runnerType).toBe('Enterprise');
    expect(call.githubRunnerConfig.runnerOwner).toBe('acme-enterprise');
    expect(call.githubRunnerConfig.enterpriseSlug).toBe('acme-enterprise');
    expect(call.githubInstallationClient).toBe(mockOctokit);
  });

  it('groups enterprise jobs by enterprise slug and dynamic labels', async () => {
    const enterpriseJobs: ActionRequestMessageSQS[] = [
      { ...TEST_DATA[0], messageId: 'm1', labels: ['ghr-linux'] },
      { ...TEST_DATA[0], messageId: 'm2', labels: ['ghr-linux'] },
      { ...TEST_DATA[0], messageId: 'm3', labels: ['ghr-macos'] },
    ];

    await scaleUpModule.scaleUp(enterpriseJobs);

    expect(mockProvider.createRunners).toHaveBeenCalledTimes(2);
  });

  it('still republishes successful messages for retry handling', async () => {
    await scaleUpModule.scaleUp(TEST_DATA);
    expect(mockedPublishRetryMessage).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'foobar' }));
  });
});
