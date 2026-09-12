import { isJobQueued, createStartRunnerConfig } from './github-runner';
import { metricGitHubAppRateLimit } from '../github/rate-limit';
import type { ActionRequestMessage, CreateGitHubRunnerConfig } from './types';
import type { RunnerConfigStore } from '@aws-github-runner/storage-providers';
import type { Octokit } from '@octokit/rest';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../github/rate-limit', () => ({
  metricGitHubAppRateLimit: vi.fn(),
}));

const mockedMetricGitHubAppRateLimit = vi.mocked(metricGitHubAppRateLimit);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Test isJobQueued rate-limit metric on error', () => {
  const payload: ActionRequestMessage = {
    id: 1,
    eventType: 'workflow_job',
    repositoryName: 'hello-world',
    repositoryOwner: 'octo-org',
    installationId: 1,
    repoOwnerType: 'Organization',
  };

  it('records the rate-limit metric on success (regression guard)', async () => {
    const client = {
      actions: {
        getJobForWorkflowRun: vi.fn().mockResolvedValue({
          data: { status: 'queued' },
          headers: { 'x-ratelimit-remaining': '10' },
        }),
      },
    } as unknown as Octokit;

    await expect(isJobQueued(client, payload, 0)).resolves.toBe(true);
    expect(mockedMetricGitHubAppRateLimit).toHaveBeenCalledWith({ 'x-ratelimit-remaining': '10' }, 0);
  });

  it('records the rate-limit metric using the error response headers when the call is rate-limited', async () => {
    const rateLimitError = Object.assign(new Error('rate limit exceeded'), {
      status: 403,
      response: { headers: { 'x-ratelimit-remaining': '0' } },
    });
    const client = {
      actions: {
        getJobForWorkflowRun: vi.fn().mockRejectedValue(rateLimitError),
      },
    } as unknown as Octokit;

    await expect(isJobQueued(client, payload, 1)).rejects.toBe(rateLimitError);
    expect(mockedMetricGitHubAppRateLimit).toHaveBeenCalledWith({ 'x-ratelimit-remaining': '0' }, 1);
  });

  it('does not call the metric when the error carries no response headers', async () => {
    const networkError = new Error('socket hang up');
    const client = {
      actions: {
        getJobForWorkflowRun: vi.fn().mockRejectedValue(networkError),
      },
    } as unknown as Octokit;

    await expect(isJobQueued(client, payload, 0)).rejects.toBe(networkError);
    expect(mockedMetricGitHubAppRateLimit).not.toHaveBeenCalled();
  });
});

describe('Test createJitConfig rate-limit metric on error', () => {
  const githubRunnerConfig: CreateGitHubRunnerConfig = {
    appIndex: 2,
    ephemeral: true,
    enableJitConfig: true,
    runnerLabels: 'self-hosted',
    runnerGroup: 'Default',
    runnerNamePrefix: 'test-',
    runnerOwner: 'octo-org/hello-world',
    runnerType: 'Repo',
    disableAutoUpdate: false,
  };

  const runnerConfigStore = { create: vi.fn() } as unknown as RunnerConfigStore;

  it('records the rate-limit metric using the error response headers when JIT config generation is rate-limited', async () => {
    const rateLimitError = Object.assign(new Error('rate limit exceeded'), {
      status: 403,
      response: { headers: { 'x-ratelimit-remaining': '0' } },
    });
    const client = {
      actions: {
        generateRunnerJitconfigForRepo: vi.fn().mockRejectedValue(rateLimitError),
      },
    } as unknown as Octokit;

    const failedRunnerIds = await createStartRunnerConfig(githubRunnerConfig, ['i-1'], client, {
      runnerConfigStore,
    });

    expect(failedRunnerIds).toEqual(['i-1']);
    expect(mockedMetricGitHubAppRateLimit).toHaveBeenCalledWith({ 'x-ratelimit-remaining': '0' }, 2);
  });
});
