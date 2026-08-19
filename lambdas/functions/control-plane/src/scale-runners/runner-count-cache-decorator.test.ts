import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withRunnerCountCache } from './runner-count-cache-decorator';
import { ec2RunnerCountCache, dynamoDbRunnerCountCache } from './runner-count-cache';
import type { ScaleUpComputeProvider } from './types';

function fakeProvider(currentRunners = 7) {
  return {
    type: 'aws-ec2',
    resolveLabelsForRunners: vi.fn(),
    getCurrentRunners: vi.fn().mockResolvedValue(currentRunners),
    createRunners: vi.fn().mockResolvedValue({ instances: ['i-1', 'i-2'], retryableErrorCount: 0, nonRetryableErrorCount: 0 }),
  } as unknown as ScaleUpComputeProvider<unknown>;
}

const input = { runnerType: 'Repo' as const, runnerOwner: 'acme/app' };

beforeEach(() => {
  vi.restoreAllMocks();
  ec2RunnerCountCache.reset();
  process.env.AWS_REGION = 'eu-west-1';
  process.env.ENVIRONMENT = 'prod';
  process.env.RUNNER_COUNT_CACHE_TABLE_NAME = 'runner-counts';
});

describe('withRunnerCountCache', () => {
  it('is a transparent pass-through when the cache table is not configured', async () => {
    delete process.env.RUNNER_COUNT_CACHE_TABLE_NAME;
    const provider = fakeProvider(5);
    const wrapped = withRunnerCountCache(provider);
    expect(wrapped).toBe(provider);
  });

  it('returns the DynamoDB counter when fresh (no provider call)', async () => {
    const provider = fakeProvider(7);
    vi.spyOn(dynamoDbRunnerCountCache, 'get').mockResolvedValue({ count: 3, isStale: false });
    const wrapped = withRunnerCountCache(provider);
    expect(await wrapped.getCurrentRunners(undefined, input)).toBe(3);
    expect(provider.getCurrentRunners).not.toHaveBeenCalled();
  });

  it('falls back to the provider when the counter is stale', async () => {
    const provider = fakeProvider(7);
    vi.spyOn(dynamoDbRunnerCountCache, 'get').mockResolvedValue({ count: 3, isStale: true });
    const wrapped = withRunnerCountCache(provider);
    expect(await wrapped.getCurrentRunners(undefined, input)).toBe(7);
    expect(provider.getCurrentRunners).toHaveBeenCalledTimes(1);
  });

  it('falls back to the provider on a counter miss, then serves the in-memory value', async () => {
    const provider = fakeProvider(7);
    vi.spyOn(dynamoDbRunnerCountCache, 'get').mockResolvedValue(null);
    const wrapped = withRunnerCountCache(provider);
    expect(await wrapped.getCurrentRunners(undefined, input)).toBe(7); // provider
    expect(await wrapped.getCurrentRunners(undefined, input)).toBe(7); // in-memory
    expect(provider.getCurrentRunners).toHaveBeenCalledTimes(1);
  });

  it('resets the in-memory cache after creating runners', async () => {
    const provider = fakeProvider(7);
    const wrapped = withRunnerCountCache(provider);
    ec2RunnerCountCache.set('prod', 'Repo', 'acme/app', 5);
    expect(ec2RunnerCountCache.get('prod', 'Repo', 'acme/app')).toBe(5);
    const result = await wrapped.createRunners({} as never);
    expect(result.instances).toHaveLength(2);
    expect(ec2RunnerCountCache.get('prod', 'Repo', 'acme/app')).toBeUndefined();
  });
});
