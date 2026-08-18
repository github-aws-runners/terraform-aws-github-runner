import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAwsSsmRunnerConfigStore } from './aws/ssm/runner-config-store';
import type { RunnerConfigStore } from './core';
import { getRunnerConfigStore, resetRunnerConfigStore } from './runner-config';

vi.mock('./aws/ssm/runner-config-store', () => ({
  createAwsSsmRunnerConfigStore: vi.fn(),
}));

const createAwsSsmRunnerConfigStoreMock = vi.mocked(createAwsSsmRunnerConfigStore);
const cleanEnv = process.env;

describe('runner config store selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...cleanEnv };
    delete process.env.RUNNER_CONFIG_STORAGE_PROVIDER;
    resetRunnerConfigStore();
  });

  it.each([undefined, '', '   '])('uses aws_ssm for default selector input %j', (provider) => {
    setProvider(provider);
    const store = stubStore();

    expect(getRunnerConfigStore()).toBe(store);
    expect(createAwsSsmRunnerConfigStoreMock).toHaveBeenCalledOnce();
  });

  it.each(['aws_ssm', ' AWS_SSM '])('uses aws_ssm for explicit selector input %j', (provider) => {
    process.env.RUNNER_CONFIG_STORAGE_PROVIDER = provider;
    const store = stubStore();

    expect(getRunnerConfigStore()).toBe(store);
    expect(createAwsSsmRunnerConfigStoreMock).toHaveBeenCalledOnce();
  });

  it('rejects an unsupported provider on first use', () => {
    process.env.RUNNER_CONFIG_STORAGE_PROVIDER = 'not-registered';

    expect(createAwsSsmRunnerConfigStoreMock).not.toHaveBeenCalled();
    expect(() => getRunnerConfigStore()).toThrow("Unsupported runner config storage provider 'not-registered'");
    expect(createAwsSsmRunnerConfigStoreMock).not.toHaveBeenCalled();
  });

  it('selects lazily and caches the created store', () => {
    const store = stubStore();

    expect(createAwsSsmRunnerConfigStoreMock).not.toHaveBeenCalled();
    const first = getRunnerConfigStore();
    process.env.RUNNER_CONFIG_STORAGE_PROVIDER = 'not-registered';
    const second = getRunnerConfigStore();

    expect(first).toBe(store);
    expect(second).toBe(store);
    expect(createAwsSsmRunnerConfigStoreMock).toHaveBeenCalledOnce();
  });

  it('selects again after the test reset', () => {
    const firstStore = stubStore();
    expect(getRunnerConfigStore()).toBe(firstStore);

    const secondStore = { create: vi.fn() } satisfies RunnerConfigStore;
    createAwsSsmRunnerConfigStoreMock.mockReturnValue(secondStore);
    resetRunnerConfigStore();

    expect(getRunnerConfigStore()).toBe(secondStore);
    expect(createAwsSsmRunnerConfigStoreMock).toHaveBeenCalledTimes(2);
  });
});

function setProvider(provider: string | undefined): void {
  if (provider === undefined) {
    delete process.env.RUNNER_CONFIG_STORAGE_PROVIDER;
  } else {
    process.env.RUNNER_CONFIG_STORAGE_PROVIDER = provider;
  }
}

function stubStore(): RunnerConfigStore {
  const store = { create: vi.fn() } satisfies RunnerConfigStore;
  createAwsSsmRunnerConfigStoreMock.mockReturnValue(store);
  return store;
}
