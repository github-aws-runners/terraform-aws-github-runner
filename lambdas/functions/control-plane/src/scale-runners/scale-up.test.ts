import { describe, it, expect, beforeEach, vi } from 'vitest';

import * as ghAuth from '../github/auth';
import { publishRetryMessage } from './job-retry';
import { scaleUp } from './scale-up';
import { createScaleUpRunnerProviderFromEnv, getDefaultScaleUpRunnerProviderType } from './scale-up-provider-registry';
import type { Octokit } from '@octokit/rest';
import type { ActionRequestMessageSQS } from './types';

const testProvider = vi.hoisted(() => ({
  type: 'test-provider',
  prepareGroup: vi.fn(),
  getCurrentRunners: vi.fn(),
  createRunners: vi.fn(),
}));

const mockOctokit = {
  actions: {
    getJobForWorkflowRun: vi.fn(),
  },
  apps: {
    getOrgInstallation: vi.fn(),
    getRepoInstallation: vi.fn(),
  },
};

vi.mock('../github/auth', async () => ({
  createGithubAppAuth: vi.fn(),
  createGithubInstallationAuth: vi.fn(),
  createOctokitClient: vi.fn(),
}));

vi.mock('./job-retry', () => ({
  publishRetryMessage: vi.fn(),
}));

vi.mock('./scale-up-provider-registry', () => ({
  createScaleUpRunnerProviderFromEnv: vi.fn(() => testProvider),
  getDefaultScaleUpRunnerProviderType: vi.fn(() => 'test-provider'),
}));

const cleanEnv = process.env;
const mockedCreateGithubAppAuth = vi.mocked(ghAuth.createGithubAppAuth);
const mockedCreateGithubInstallationAuth = vi.mocked(ghAuth.createGithubInstallationAuth);
const mockedCreateOctokitClient = vi.mocked(ghAuth.createOctokitClient);
const mockedCreateScaleUpRunnerProviderFromEnv = vi.mocked(createScaleUpRunnerProviderFromEnv);
const mockedGetDefaultScaleUpRunnerProviderType = vi.mocked(getDefaultScaleUpRunnerProviderType);
const mockedPublishRetryMessage = vi.mocked(publishRetryMessage);

const TEST_MESSAGE: ActionRequestMessageSQS = {
  id: 1,
  eventType: 'workflow_job',
  repositoryName: 'hello-world',
  repositoryOwner: 'Codertocat',
  installationId: 2,
  repoOwnerType: 'Organization',
  messageId: 'message-1',
  labels: ['self-hosted', 'ghr-provider-size:large'],
};

function setDefaults() {
  process.env = { ...cleanEnv };
  process.env.GITHUB_APP_KEY_BASE64 = 'TEST_CERTIFICATE_DATA';
  process.env.GITHUB_APP_ID = '1337';
  process.env.GITHUB_APP_CLIENT_ID = 'TEST_CLIENT_ID';
  process.env.GITHUB_APP_CLIENT_SECRET = 'TEST_CLIENT_SECRET';
  process.env.RUNNERS_MAXIMUM_COUNT = '3';
  process.env.ENVIRONMENT = 'unit-test-environment';
  process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
  process.env.ENABLE_EPHEMERAL_RUNNERS = 'false';
  process.env.RUNNER_NAME_PREFIX = 'unit-test-';
  process.env.RUNNER_GROUP_NAME = 'Default';
  process.env.SSM_CONFIG_PATH = '/github-action-runners/default/runners/config';
  process.env.SSM_TOKEN_PATH = '/github-action-runners/default/runners/config';
  process.env.RUNNER_LABELS = 'base-label';
  process.env.SCALE_ERRORS =
    '["UnfulfillableCapacity","MaxSpotInstanceCountExceeded","TargetCapacityLimitExceededException"]';
}

beforeEach(() => {
  vi.clearAllMocks();
  setDefaults();

  testProvider.prepareGroup.mockResolvedValue({
    runnerLabels: ['ghr-provider-size:large'],
    state: { prepared: true },
  });
  testProvider.getCurrentRunners.mockResolvedValue(0);
  testProvider.createRunners.mockResolvedValue(['runner-1']);

  mockedCreateGithubAppAuth.mockResolvedValue({
    type: 'app',
    token: 'app-token',
    appId: 1,
    expiresAt: 'some-date',
  });
  mockedCreateGithubInstallationAuth.mockResolvedValue({
    type: 'token',
    tokenType: 'installation',
    token: 'installation-token',
    createdAt: 'some-date',
    expiresAt: 'some-date',
    permissions: {},
    repositorySelection: 'all',
    installationId: 2,
  });
  mockedCreateOctokitClient.mockResolvedValue(mockOctokit as unknown as Octokit);
  mockOctokit.actions.getJobForWorkflowRun.mockResolvedValue({
    data: { status: 'queued' },
    headers: {},
  });
});

describe('scaleUp runner provider orchestration', () => {
  it('creates the configured provider and forwards provider state into runner creation', async () => {
    process.env.RUNNER_PROVIDER_TYPE = 'test-provider';

    const rejectedMessages = await scaleUp([TEST_MESSAGE]);

    expect(rejectedMessages).toEqual([]);
    expect(mockedGetDefaultScaleUpRunnerProviderType).toHaveBeenCalled();
    expect(mockedCreateScaleUpRunnerProviderFromEnv).toHaveBeenCalledWith('test-provider', 'unit-test-environment', [
      'UnfulfillableCapacity',
      'MaxSpotInstanceCountExceeded',
      'TargetCapacityLimitExceededException',
    ]);
    expect(testProvider.prepareGroup).toHaveBeenCalledWith(TEST_MESSAGE.labels);
    expect(testProvider.getCurrentRunners).toHaveBeenCalledWith(
      { prepared: true },
      {
        runnerOwner: TEST_MESSAGE.repositoryOwner,
        runnerType: 'Org',
      },
    );
    expect(testProvider.createRunners).toHaveBeenCalledWith(
      expect.objectContaining({
        githubInstallationClient: mockOctokit,
        messages: [TEST_MESSAGE],
        numberOfRunners: 1,
        state: { prepared: true },
        githubRunnerConfig: expect.objectContaining({
          runnerLabels: 'base-label,ghr-provider-size:large',
          runnerOwner: TEST_MESSAGE.repositoryOwner,
          runnerType: 'Org',
        }),
      }),
    );
    expect(mockedPublishRetryMessage).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'message-1' }));
  });

  it('uses the default provider type when no provider type is configured', async () => {
    await scaleUp([TEST_MESSAGE]);

    expect(mockedCreateScaleUpRunnerProviderFromEnv).toHaveBeenCalledWith(
      'test-provider',
      'unit-test-environment',
      expect.any(Array),
    );
  });

  it('resolves installation again when the event installation belongs to another app', async () => {
    process.env.GHES_URL = 'https://github.enterprise.something';
    mockOctokit.apps.getOrgInstallation.mockResolvedValue({ data: { id: 123 } });
    mockedCreateGithubInstallationAuth.mockRejectedValueOnce({ status: 404 }).mockResolvedValueOnce({
      type: 'token',
      tokenType: 'installation',
      token: 'installation-token',
      createdAt: 'some-date',
      expiresAt: 'some-date',
      permissions: {},
      repositorySelection: 'all',
      installationId: 123,
    });

    await scaleUp([TEST_MESSAGE]);

    expect(mockOctokit.apps.getOrgInstallation).toHaveBeenCalledWith({ org: TEST_MESSAGE.repositoryOwner });
    expect(mockedCreateGithubInstallationAuth).toHaveBeenNthCalledWith(
      1,
      TEST_MESSAGE.installationId,
      'https://github.enterprise.something/api/v3',
    );
    expect(mockedCreateGithubInstallationAuth).toHaveBeenNthCalledWith(
      2,
      123,
      'https://github.enterprise.something/api/v3',
    );
    expect(testProvider.createRunners).toHaveBeenCalledTimes(1);
  });

  it('does not query current provider runners when the maximum runner count is unlimited', async () => {
    process.env.RUNNERS_MAXIMUM_COUNT = '-1';
    testProvider.createRunners.mockResolvedValue(['runner-1', 'runner-2']);
    const secondMessage: ActionRequestMessageSQS = {
      ...TEST_MESSAGE,
      id: 2,
      messageId: 'message-2',
    };

    await scaleUp([TEST_MESSAGE, secondMessage]);

    expect(testProvider.getCurrentRunners).not.toHaveBeenCalled();
    expect(testProvider.createRunners).toHaveBeenCalledWith(expect.objectContaining({ numberOfRunners: 2 }));
  });

  it('does not ask the provider to create runners when no jobs are queued', async () => {
    mockOctokit.actions.getJobForWorkflowRun.mockResolvedValue({
      data: { status: 'completed' },
      headers: {},
    });

    await scaleUp([TEST_MESSAGE]);

    expect(testProvider.getCurrentRunners).not.toHaveBeenCalled();
    expect(testProvider.createRunners).not.toHaveBeenCalled();
    expect(mockedPublishRetryMessage).not.toHaveBeenCalled();
  });
});
