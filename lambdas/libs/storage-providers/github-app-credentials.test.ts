import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAwsDynamoDbGitHubAppCredentialsStore } from './aws/dynamodb/github-app-credentials-store';
import { createAwsSsmGitHubAppCredentialsStore } from './aws/ssm/github-app-credentials-store';
import type { GitHubAppCredentialsStore } from './core';
import { getGitHubAppCredentialsStore, resetGitHubAppCredentialsStore } from './github-app-credentials';

vi.mock('./aws/dynamodb/github-app-credentials-store', () => ({
  createAwsDynamoDbGitHubAppCredentialsStore: vi.fn(),
}));
vi.mock('./aws/ssm/github-app-credentials-store', () => ({
  createAwsSsmGitHubAppCredentialsStore: vi.fn(),
}));

const createAwsDynamoDbStoreMock = vi.mocked(createAwsDynamoDbGitHubAppCredentialsStore);
const createAwsSsmStoreMock = vi.mocked(createAwsSsmGitHubAppCredentialsStore);
const cleanEnv = process.env;

describe('GitHub App credentials store selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...cleanEnv };
    delete process.env.RUNNER_CONFIG_STORAGE_PROVIDER;
    resetGitHubAppCredentialsStore();
  });

  it.each([undefined, '', '   ', 'aws_ssm', ' AWS_SSM '])('uses aws_ssm for selector input %j', (provider) => {
    setProvider(provider);
    const store = stubSsmStore();

    expect(getGitHubAppCredentialsStore()).toBe(store);
    expect(createAwsSsmStoreMock).toHaveBeenCalledOnce();
    expect(createAwsDynamoDbStoreMock).not.toHaveBeenCalled();
  });

  it.each(['aws_dynamodb', ' AWS_DYNAMODB '])('uses aws_dynamodb for selector input %j', (provider) => {
    setProvider(provider);
    const store = stubDynamoDbStore();

    expect(getGitHubAppCredentialsStore()).toBe(store);
    expect(createAwsDynamoDbStoreMock).toHaveBeenCalledOnce();
    expect(createAwsSsmStoreMock).not.toHaveBeenCalled();
  });

  it('rejects an unsupported provider before creating a store', () => {
    setProvider('not-registered');

    expect(() => getGitHubAppCredentialsStore()).toThrow("Unsupported runner config storage provider 'not-registered'");
    expect(createAwsSsmStoreMock).not.toHaveBeenCalled();
    expect(createAwsDynamoDbStoreMock).not.toHaveBeenCalled();
  });

  it('creates the selected store lazily and caches it', () => {
    const store = stubSsmStore();

    expect(createAwsSsmStoreMock).not.toHaveBeenCalled();
    const first = getGitHubAppCredentialsStore();
    setProvider('not-registered');
    const second = getGitHubAppCredentialsStore();

    expect(first).toBe(store);
    expect(second).toBe(store);
    expect(createAwsSsmStoreMock).toHaveBeenCalledOnce();
  });

  it('selects again after the test reset', () => {
    const firstStore = stubSsmStore();
    expect(getGitHubAppCredentialsStore()).toBe(firstStore);

    const secondStore = { get: vi.fn() } satisfies GitHubAppCredentialsStore;
    createAwsSsmStoreMock.mockReturnValue(secondStore);
    resetGitHubAppCredentialsStore();

    expect(getGitHubAppCredentialsStore()).toBe(secondStore);
    expect(createAwsSsmStoreMock).toHaveBeenCalledTimes(2);
  });
});

function setProvider(provider: string | undefined): void {
  if (provider === undefined) {
    delete process.env.RUNNER_CONFIG_STORAGE_PROVIDER;
  } else {
    process.env.RUNNER_CONFIG_STORAGE_PROVIDER = provider;
  }
}

function stubSsmStore(): GitHubAppCredentialsStore {
  const store = { get: vi.fn() } satisfies GitHubAppCredentialsStore;
  createAwsSsmStoreMock.mockReturnValue(store);
  return store;
}

function stubDynamoDbStore(): GitHubAppCredentialsStore {
  const store = { get: vi.fn() } satisfies GitHubAppCredentialsStore;
  createAwsDynamoDbStoreMock.mockReturnValue(store);
  return store;
}
