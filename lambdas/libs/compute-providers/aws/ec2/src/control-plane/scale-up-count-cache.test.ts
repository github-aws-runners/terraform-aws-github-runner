import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./runners', () => ({
  listEC2Runners: vi.fn(),
}));
vi.mock('./runner-config', () => ({
  createRunners: vi.fn(),
  loadEc2ProviderConfig: vi.fn().mockReturnValue({}),
}));

import { listEC2Runners } from './runners';
import { createRunners } from './runner-config';
import { createEc2ScaleUpProvider } from './scale-up';
import { ec2RunnerCountCache, dynamoDbRunnerCountCache } from './runner-count-cache';

const mockListRunners = vi.mocked(listEC2Runners);
const mockCreateRunners = vi.mocked(createRunners);
const provider = createEc2ScaleUpProvider(vi.fn());
const input = { runnerType: 'Repo' as const, runnerOwner: 'acme/app' };
const cleanEnv = process.env;

function runners(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `i-${i}`, type: 'Repo', owner: 'acme/app' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  ec2RunnerCountCache.reset();
  dynamoDbRunnerCountCache.reset();
  process.env = { ...cleanEnv };
  process.env.AWS_REGION = 'eu-west-1';
  process.env.ENVIRONMENT = 'prod';
  process.env.RUNNER_COUNT_CACHE_TABLE_NAME = 'runner-counts';
  mockListRunners.mockResolvedValue(runners(7) as never);
});

describe('getCurrentRunners with the runner count cache', () => {
  it('lists EC2 (DescribeInstances) when the cache table is not configured', async () => {
    delete process.env.RUNNER_COUNT_CACHE_TABLE_NAME;
    expect(await provider.getCurrentRunners({}, input)).toBe(7);
    expect(mockListRunners).toHaveBeenCalledTimes(1);
  });

  it('returns the DynamoDB counter when fresh, without listing EC2', async () => {
    vi.spyOn(dynamoDbRunnerCountCache, 'get').mockResolvedValue({ count: 3, isStale: false });
    expect(await provider.getCurrentRunners({}, input)).toBe(3);
    expect(mockListRunners).not.toHaveBeenCalled();
  });

  it('falls back to listing EC2 when the counter is stale', async () => {
    vi.spyOn(dynamoDbRunnerCountCache, 'get').mockResolvedValue({ count: 3, isStale: true });
    expect(await provider.getCurrentRunners({}, input)).toBe(7);
    expect(mockListRunners).toHaveBeenCalledTimes(1);
  });

  it('falls back to listing EC2 on a counter miss, then serves the in-memory value', async () => {
    vi.spyOn(dynamoDbRunnerCountCache, 'get').mockResolvedValue(null);
    expect(await provider.getCurrentRunners({}, input)).toBe(7); // lists EC2
    expect(await provider.getCurrentRunners({}, input)).toBe(7); // in-memory
    expect(mockListRunners).toHaveBeenCalledTimes(1);
  });

  it('resets the in-memory count after creating runners', async () => {
    mockCreateRunners.mockResolvedValue({
      instances: ['i-1'],
      retryableErrorCount: 0,
      nonRetryableErrorCount: 0,
    } as never);
    ec2RunnerCountCache.set('prod', 'Repo', 'acme/app', 5);
    expect(ec2RunnerCountCache.get('prod', 'Repo', 'acme/app')).toBe(5);
    await provider.createRunners({
      githubRunnerConfig: {},
      numberOfRunners: 1,
      githubInstallationClient: {},
      state: {},
    } as never);
    expect(ec2RunnerCountCache.get('prod', 'Repo', 'acme/app')).toBeUndefined();
  });
});
