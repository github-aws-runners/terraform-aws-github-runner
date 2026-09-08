import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAwsDynamoDbRunnerMatcherConfigStore } from './aws/dynamodb/runner-matcher-config-store';
import { createAwsSsmRunnerMatcherConfigStore } from './aws/ssm/runner-matcher-config-store';
import type { RunnerMatcherConfigStore } from './core';
import { getRunnerMatcherConfigStore, resetRunnerMatcherConfigStore } from './runner-matcher-config';

vi.mock('./aws/dynamodb/runner-matcher-config-store', () => ({
  createAwsDynamoDbRunnerMatcherConfigStore: vi.fn(),
}));
vi.mock('./aws/ssm/runner-matcher-config-store', () => ({
  createAwsSsmRunnerMatcherConfigStore: vi.fn(),
}));

const createAwsDynamoDbRunnerMatcherConfigStoreMock = vi.mocked(createAwsDynamoDbRunnerMatcherConfigStore);
const createAwsSsmRunnerMatcherConfigStoreMock = vi.mocked(createAwsSsmRunnerMatcherConfigStore);
const cleanEnv = process.env;

describe('runner matcher config store selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...cleanEnv };
    delete process.env.RUNNER_CONFIG_STORAGE_PROVIDER;
    resetRunnerMatcherConfigStore();
  });

  it.each([undefined, '', '   '])('uses aws_ssm for default selector input %j', (provider) => {
    setProvider(provider);
    const store = stubStore();

    expect(getRunnerMatcherConfigStore()).toBe(store);
    expect(createAwsSsmRunnerMatcherConfigStoreMock).toHaveBeenCalledOnce();
    expect(createAwsDynamoDbRunnerMatcherConfigStoreMock).not.toHaveBeenCalled();
  });

  it.each(['aws_ssm', ' AWS_SSM '])('uses aws_ssm for explicit selector input %j', (provider) => {
    process.env.RUNNER_CONFIG_STORAGE_PROVIDER = provider;
    const store = stubStore();

    expect(getRunnerMatcherConfigStore()).toBe(store);
    expect(createAwsSsmRunnerMatcherConfigStoreMock).toHaveBeenCalledOnce();
    expect(createAwsDynamoDbRunnerMatcherConfigStoreMock).not.toHaveBeenCalled();
  });

  it.each(['aws_dynamodb', ' AWS_DYNAMODB '])('uses aws_dynamodb for explicit selector input %j', (provider) => {
    process.env.RUNNER_CONFIG_STORAGE_PROVIDER = provider;
    const store = stubDynamoDbStore();

    expect(getRunnerMatcherConfigStore()).toBe(store);
    expect(createAwsDynamoDbRunnerMatcherConfigStoreMock).toHaveBeenCalledOnce();
    expect(createAwsSsmRunnerMatcherConfigStoreMock).not.toHaveBeenCalled();
  });

  it('rejects an unsupported provider on first use', () => {
    process.env.RUNNER_CONFIG_STORAGE_PROVIDER = 'not-registered';

    expect(() => getRunnerMatcherConfigStore()).toThrow("Unsupported runner config storage provider 'not-registered'");
    expect(createAwsSsmRunnerMatcherConfigStoreMock).not.toHaveBeenCalled();
    expect(createAwsDynamoDbRunnerMatcherConfigStoreMock).not.toHaveBeenCalled();
  });

  it('selects lazily and caches the created store', () => {
    const store = stubStore();

    expect(createAwsSsmRunnerMatcherConfigStoreMock).not.toHaveBeenCalled();
    const first = getRunnerMatcherConfigStore();
    process.env.RUNNER_CONFIG_STORAGE_PROVIDER = 'not-registered';
    const second = getRunnerMatcherConfigStore();

    expect(first).toBe(store);
    expect(second).toBe(store);
    expect(createAwsSsmRunnerMatcherConfigStoreMock).toHaveBeenCalledOnce();
  });

  it('selects again after the test reset', () => {
    const firstStore = stubStore();
    expect(getRunnerMatcherConfigStore()).toBe(firstStore);

    const secondStore = { get: vi.fn() } satisfies RunnerMatcherConfigStore;
    createAwsSsmRunnerMatcherConfigStoreMock.mockReturnValue(secondStore);
    resetRunnerMatcherConfigStore();

    expect(getRunnerMatcherConfigStore()).toBe(secondStore);
    expect(createAwsSsmRunnerMatcherConfigStoreMock).toHaveBeenCalledTimes(2);
  });
});

function setProvider(provider: string | undefined): void {
  if (provider === undefined) {
    delete process.env.RUNNER_CONFIG_STORAGE_PROVIDER;
  } else {
    process.env.RUNNER_CONFIG_STORAGE_PROVIDER = provider;
  }
}

function stubStore(): RunnerMatcherConfigStore {
  const store = { get: vi.fn() } satisfies RunnerMatcherConfigStore;
  createAwsSsmRunnerMatcherConfigStoreMock.mockReturnValue(store);
  return store;
}

function stubDynamoDbStore(): RunnerMatcherConfigStore {
  const store = { get: vi.fn() } satisfies RunnerMatcherConfigStore;
  createAwsDynamoDbRunnerMatcherConfigStoreMock.mockReturnValue(store);
  return store;
}
