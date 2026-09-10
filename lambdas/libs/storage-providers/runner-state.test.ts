import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAwsDynamoDbRunnerStateStore } from './aws/dynamodb/runner-state-store';
import type { RunnerStateStore } from './core';
import { getRunnerStateStore, resetRunnerStateStore } from './runner-state';

vi.mock('./aws/dynamodb/runner-state-store', () => ({
  createAwsDynamoDbRunnerStateStore: vi.fn(),
}));

const createAwsDynamoDbRunnerStateStoreMock = vi.mocked(createAwsDynamoDbRunnerStateStore);
const cleanEnv = process.env;

describe('runner state store selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...cleanEnv };
    delete process.env.RUNNER_CONFIG_STORAGE_PROVIDER;
    resetRunnerStateStore();
  });

  it.each([undefined, '', '   ', 'aws_ssm', ' AWS_SSM '])(
    'returns no inventory capability for aws_ssm selector input %j',
    (provider) => {
      setProvider(provider);

      expect(getRunnerStateStore()).toBeUndefined();
      expect(createAwsDynamoDbRunnerStateStoreMock).not.toHaveBeenCalled();
    },
  );

  it.each(['aws_dynamodb', ' AWS_DYNAMODB '])('creates the DynamoDB inventory for selector input %j', (provider) => {
    setProvider(provider);
    const store = stubStore();

    expect(getRunnerStateStore()).toBe(store);
    expect(createAwsDynamoDbRunnerStateStoreMock).toHaveBeenCalledOnce();
  });

  it('rejects an unsupported provider before creating a store', () => {
    setProvider('not-registered');

    expect(() => getRunnerStateStore()).toThrow("Unsupported runner config storage provider 'not-registered'");
    expect(createAwsDynamoDbRunnerStateStoreMock).not.toHaveBeenCalled();
  });

  it('caches the DynamoDB store until reset', () => {
    setProvider('aws_dynamodb');
    const firstStore = stubStore();

    expect(getRunnerStateStore()).toBe(firstStore);
    expect(getRunnerStateStore()).toBe(firstStore);
    expect(createAwsDynamoDbRunnerStateStoreMock).toHaveBeenCalledOnce();

    const secondStore = createStubStore();
    createAwsDynamoDbRunnerStateStoreMock.mockReturnValue(secondStore);
    resetRunnerStateStore();
    expect(getRunnerStateStore()).toBe(secondStore);
    expect(createAwsDynamoDbRunnerStateStoreMock).toHaveBeenCalledTimes(2);
  });
});

function setProvider(provider: string | undefined): void {
  if (provider === undefined) {
    delete process.env.RUNNER_CONFIG_STORAGE_PROVIDER;
  } else {
    process.env.RUNNER_CONFIG_STORAGE_PROVIDER = provider;
  }
}

function stubStore(): RunnerStateStore {
  const store = createStubStore();
  createAwsDynamoDbRunnerStateStoreMock.mockReturnValue(store);
  return store;
}

function createStubStore(): RunnerStateStore {
  return {
    create: vi.fn(),
    recordGitHubIdentity: vi.fn(),
    activate: vi.fn(),
    list: vi.fn(),
    markOrphan: vi.fn(),
    unmarkOrphan: vi.fn(),
    beginTermination: vi.fn(),
    cancelTermination: vi.fn(),
    delete: vi.fn(),
  };
}
