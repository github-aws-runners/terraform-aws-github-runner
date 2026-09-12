import { addDelay, createStartRunnerConfig } from './github-runner';
import type { CreateGitHubRunnerConfig } from './types';
import type { RunnerConfigStore } from '@aws-github-runner/storage-providers';
import { Octokit } from '@octokit/rest';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const cleanEnv = process.env;

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...cleanEnv };
  delete process.env.SSM_PARAMETER_STORE_MAX_CONCURRENT_INVOCATIONS;
});

describe('Test addDelay', () => {
  it('does not delay when the store has no write limit', () => {
    const store = { maxWritesPerSecond: undefined } as RunnerConfigStore;
    const { isDelay, delayMilliseconds } = addDelay(['1', '2'], store);
    expect(isDelay).toBe(false);
    expect(delayMilliseconds).toBe(0);
  });

  it('does not delay for an empty batch', () => {
    const store = { maxWritesPerSecond: 40 } as RunnerConfigStore;
    const { isDelay } = addDelay([], store);
    expect(isDelay).toBe(false);
  });

  it('paces a batch below the write limit, unlike the previous per-invocation-only guard', () => {
    const store = { maxWritesPerSecond: 40 } as RunnerConfigStore;
    // A batch of 2 is far below 40, but the account-wide limit does not care about batch size.
    const { isDelay, delayMilliseconds } = addDelay(['1', '2'], store);
    expect(isDelay).toBe(true);
    expect(delayMilliseconds).toBe(25); // 1000 / 40
  });

  it('divides the per-write delay across the configured number of concurrent invocations', () => {
    process.env.SSM_PARAMETER_STORE_MAX_CONCURRENT_INVOCATIONS = '5';
    const store = { maxWritesPerSecond: 40 } as RunnerConfigStore;
    const { delayMilliseconds } = addDelay(['1'], store);
    expect(delayMilliseconds).toBe(125); // (1000 / 40) * 5
  });

  it.each(['0', '-1', 'not-a-number', ''])(
    'treats an invalid concurrency value (%s) as a single invocation',
    (value) => {
      process.env.SSM_PARAMETER_STORE_MAX_CONCURRENT_INVOCATIONS = value;
      const store = { maxWritesPerSecond: 40 } as RunnerConfigStore;
      const { delayMilliseconds } = addDelay(['1'], store);
      expect(delayMilliseconds).toBe(25);
    },
  );
});

describe('Test createStartRunnerConfig registration-token pacing', () => {
  const mockOctokit = {
    actions: {
      createRegistrationTokenForOrg: vi.fn().mockResolvedValue({ data: { token: 'reg-token' } }),
    },
  } as unknown as Octokit;

  const githubRunnerConfig: CreateGitHubRunnerConfig = {
    ephemeral: false,
    enableJitConfig: false,
    runnerLabels: 'self-hosted',
    runnerGroup: 'Default',
    runnerNamePrefix: 'test-',
    runnerOwner: 'my-org',
    runnerType: 'Org',
    disableAutoUpdate: false,
  };

  it('paces every write between concurrent pools, not just large single-invocation batches', async () => {
    vi.useFakeTimers();
    const create = vi.fn().mockResolvedValue(undefined);
    const runnerConfigStore = { maxWritesPerSecond: 40, create } as unknown as RunnerConfigStore;

    process.env.SSM_PARAMETER_STORE_MAX_CONCURRENT_INVOCATIONS = '4';
    const runPromise = createStartRunnerConfig(githubRunnerConfig, ['a', 'b', 'c'], mockOctokit, {
      runnerConfigStore,
    });

    // Each write is followed by a (1000 / 40) * 4 = 100ms pacing delay.
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);
    await runPromise;

    expect(create).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
