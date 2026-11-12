import { createStartRunnerConfig, isJobQueued, resolveJitConfigConcurrency } from './github-runner';
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

describe('Test createJitConfig rate-limit metric on error', () => {
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
});

describe('createJitConfig concurrency', () => {
  const jitResult = { data: { runner: { id: 1 }, encoded_jit_config: 'cfg' } };
  const trackingClient = (reject = new Set<string>()) => {
    let inFlight = 0;
    const peaks: number[] = [];
    const generateRunnerJitconfigForRepo = vi.fn(async ({ name }: { name: string }) => {
      inFlight++;
      peaks.push(inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      if (reject.has(name)) throw new Error(`boom ${name}`);
      return jitResult;
    });
    return {
      client: {
        actions: { generateRunnerJitconfigForRepo },
      } as unknown as Octokit,
      peaks,
    };
  };
  const ids = Array.from({ length: 10 }, (_, i) => `i-${i}`);

  it('mints with bounded concurrency', async () => {
    const { client, peaks } = trackingClient();
    const failed = await createStartRunnerConfig(githubRunnerConfig, ids, client, {
      runnerConfigStore,
      jitConfigConcurrency: 3,
    });
    expect(failed).toEqual([]);
    expect(Math.max(...peaks)).toBe(3);
    expect(runnerConfigStore.create).toHaveBeenCalledTimes(10);
  });

  it('collects failures without stopping the batch', async () => {
    const { client } = trackingClient(new Set(['test-i-2', 'test-i-7']));
    const failed = await createStartRunnerConfig(githubRunnerConfig, ids, client, {
      runnerConfigStore,
      jitConfigConcurrency: 4,
    });
    expect(failed.sort()).toEqual(['i-2', 'i-7']);
    expect(runnerConfigStore.create).toHaveBeenCalledTimes(8);
  });

  it('falls back to the default concurrency', () => {
    for (const v of [undefined, '', 'abc', '0']) expect(resolveJitConfigConcurrency(v)).toBe(8);
    expect(resolveJitConfigConcurrency('16')).toBe(16);
  });
});
