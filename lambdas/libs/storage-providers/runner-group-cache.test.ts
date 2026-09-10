import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAwsDynamoDbRunnerGroupCacheStore } from './aws/dynamodb/runner-group-cache-store';
import { createAwsSsmRunnerGroupCacheStore } from './aws/ssm/runner-group-cache-store';
import type { RunnerGroupCacheStore } from './core';
import { getRunnerGroupCacheStore, resetRunnerGroupCacheStore } from './runner-group-cache';

vi.mock('./aws/dynamodb/runner-group-cache-store', () => ({
  createAwsDynamoDbRunnerGroupCacheStore: vi.fn(),
}));
vi.mock('./aws/ssm/runner-group-cache-store', () => ({
  createAwsSsmRunnerGroupCacheStore: vi.fn(),
}));

const createAwsDynamoDbRunnerGroupCacheStoreMock = vi.mocked(createAwsDynamoDbRunnerGroupCacheStore);
const createAwsSsmRunnerGroupCacheStoreMock = vi.mocked(createAwsSsmRunnerGroupCacheStore);
const cleanEnv = process.env;

describe('runner group cache store selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...cleanEnv };
    delete process.env.RUNNER_CONFIG_STORAGE_PROVIDER;
    resetRunnerGroupCacheStore();
  });

  it.each([undefined, '', '   '])('uses aws_ssm for default selector input %j', (provider) => {
    setProvider(provider);
    const store = stubStore();

    expect(getRunnerGroupCacheStore()).toBe(store);
    expect(createAwsSsmRunnerGroupCacheStoreMock).toHaveBeenCalledOnce();
    expect(createAwsDynamoDbRunnerGroupCacheStoreMock).not.toHaveBeenCalled();
  });

  it.each(['aws_ssm', ' AWS_SSM '])('uses aws_ssm for explicit selector input %j', (provider) => {
    process.env.RUNNER_CONFIG_STORAGE_PROVIDER = provider;
    const store = stubStore();

    expect(getRunnerGroupCacheStore()).toBe(store);
    expect(createAwsSsmRunnerGroupCacheStoreMock).toHaveBeenCalledOnce();
    expect(createAwsDynamoDbRunnerGroupCacheStoreMock).not.toHaveBeenCalled();
  });

  it.each(['aws_dynamodb', ' AWS_DYNAMODB '])('uses aws_dynamodb for explicit selector input %j', (provider) => {
    process.env.RUNNER_CONFIG_STORAGE_PROVIDER = provider;
    const store = stubDynamoDbStore();

    expect(getRunnerGroupCacheStore()).toBe(store);
    expect(createAwsDynamoDbRunnerGroupCacheStoreMock).toHaveBeenCalledOnce();
    expect(createAwsSsmRunnerGroupCacheStoreMock).not.toHaveBeenCalled();
  });

  it('rejects an unsupported provider on first use', () => {
    process.env.RUNNER_CONFIG_STORAGE_PROVIDER = 'not-registered';

    expect(() => getRunnerGroupCacheStore()).toThrow("Unsupported runner config storage provider 'not-registered'");
    expect(createAwsSsmRunnerGroupCacheStoreMock).not.toHaveBeenCalled();
    expect(createAwsDynamoDbRunnerGroupCacheStoreMock).not.toHaveBeenCalled();
  });

  it('selects lazily and caches the created store', () => {
    const store = stubStore();

    expect(createAwsSsmRunnerGroupCacheStoreMock).not.toHaveBeenCalled();
    const first = getRunnerGroupCacheStore();
    process.env.RUNNER_CONFIG_STORAGE_PROVIDER = 'not-registered';
    const second = getRunnerGroupCacheStore();

    expect(first).toBe(store);
    expect(second).toBe(store);
    expect(createAwsSsmRunnerGroupCacheStoreMock).toHaveBeenCalledOnce();
  });

  it('selects again after the test reset', () => {
    const firstStore = stubStore();
    expect(getRunnerGroupCacheStore()).toBe(firstStore);

    const secondStore = { get: vi.fn(), create: vi.fn() } satisfies RunnerGroupCacheStore;
    createAwsSsmRunnerGroupCacheStoreMock.mockReturnValue(secondStore);
    resetRunnerGroupCacheStore();

    expect(getRunnerGroupCacheStore()).toBe(secondStore);
    expect(createAwsSsmRunnerGroupCacheStoreMock).toHaveBeenCalledTimes(2);
  });
});

function setProvider(provider: string | undefined): void {
  if (provider === undefined) {
    delete process.env.RUNNER_CONFIG_STORAGE_PROVIDER;
  } else {
    process.env.RUNNER_CONFIG_STORAGE_PROVIDER = provider;
  }
}

function stubStore(): RunnerGroupCacheStore {
  const store = { get: vi.fn(), create: vi.fn() } satisfies RunnerGroupCacheStore;
  createAwsSsmRunnerGroupCacheStoreMock.mockReturnValue(store);
  return store;
}

function stubDynamoDbStore(): RunnerGroupCacheStore {
  const store = { get: vi.fn(), create: vi.fn() } satisfies RunnerGroupCacheStore;
  createAwsDynamoDbRunnerGroupCacheStoreMock.mockReturnValue(store);
  return store;
}
