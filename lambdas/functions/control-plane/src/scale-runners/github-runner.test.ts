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

  it('leaves success metrics to the shared client', async () => {
    const client = {
      actions: {
        getJobForWorkflowRun: vi.fn().mockResolvedValue({
          data: { status: 'queued' },
          headers: { 'x-ratelimit-remaining': '10' },
        }),
      },
    } as unknown as Octokit;

    await expect(isJobQueued(client, payload)).resolves.toBe(true);
    expect(mockedMetricGitHubAppRateLimit).not.toHaveBeenCalled();
  });

  it('propagates exhausted failover errors without attributing them to a stale app index', async () => {
    const rateLimitError = Object.assign(new Error('rate limit exceeded'), {
      status: 403,
      response: { headers: { 'x-ratelimit-remaining': '0' } },
    });
    const client = {
      actions: {
        getJobForWorkflowRun: vi.fn().mockRejectedValue(rateLimitError),
      },
    } as unknown as Octokit;

    await expect(isJobQueued(client, payload)).rejects.toBe(rateLimitError);
    expect(mockedMetricGitHubAppRateLimit).not.toHaveBeenCalled();
  });

  it('does not call the metric when the error carries no response headers', async () => {
    const networkError = new Error('socket hang up');
    const client = {
      actions: {
        getJobForWorkflowRun: vi.fn().mockRejectedValue(networkError),
      },
    } as unknown as Octokit;

    await expect(isJobQueued(client, payload)).rejects.toBe(networkError);
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

  it('returns failed runner IDs without attributing errors to a stale app index', async () => {
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
    expect(mockedMetricGitHubAppRateLimit).not.toHaveBeenCalled();
  });

  it('stores the one-time JIT config under the compute access scope when one is provided', async () => {
    const create = vi.fn();
    const client = {
      actions: {
        generateRunnerJitconfigForRepo: vi.fn().mockResolvedValue({
          headers: {},
          data: { runner: { id: 7 }, encoded_jit_config: 'encoded-jit' },
        }),
      },
    } as unknown as Octokit;

    const failedRunnerIds = await createStartRunnerConfig(
      { ...githubRunnerConfig, ephemeral: true, enableJitConfig: true },
      ['i-1'],
      client,
      {
        runnerConfigStore: { create } as unknown as RunnerConfigStore,
        runnerGroupCacheStore: { get: vi.fn().mockResolvedValue(1), create: vi.fn() },
        getRunnerConfigAccessScope: (id) => `arn:aws:ec2:eu-west-1:123456789012:instance/${id}`,
      },
    );

    expect(failedRunnerIds).toEqual([]);
    expect(create).toHaveBeenCalledWith(
      {
        runnerId: 'i-1',
        value: 'encoded-jit',
        accessScope: 'arn:aws:ec2:eu-west-1:123456789012:instance/i-1',
      },
      expect.anything(),
    );
  });

  it('omits the access scope when no scope provider is configured', async () => {
    const create = vi.fn();
    const client = {
      actions: {
        generateRunnerJitconfigForRepo: vi.fn().mockResolvedValue({
          headers: {},
          data: { runner: { id: 7 }, encoded_jit_config: 'encoded-jit' },
        }),
      },
    } as unknown as Octokit;

    await createStartRunnerConfig({ ...githubRunnerConfig, ephemeral: true, enableJitConfig: true }, ['i-1'], client, {
      runnerConfigStore: { create } as unknown as RunnerConfigStore,
      runnerGroupCacheStore: { get: vi.fn().mockResolvedValue(1), create: vi.fn() },
    });

    expect(create.mock.calls[0][0]).toEqual({ runnerId: 'i-1', value: 'encoded-jit' });
  });
});
