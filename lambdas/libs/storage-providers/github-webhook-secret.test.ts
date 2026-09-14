import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAwsDynamoDbGitHubWebhookSecretStore } from './aws/dynamodb/github-webhook-secret-store';
import { createAwsSsmGitHubWebhookSecretStore } from './aws/ssm/github-webhook-secret-store';
import type { GitHubWebhookSecretStore } from './core';
import { getGitHubWebhookSecretStore, resetGitHubWebhookSecretStore } from './github-webhook-secret';

vi.mock('./aws/dynamodb/github-webhook-secret-store', () => ({
  createAwsDynamoDbGitHubWebhookSecretStore: vi.fn(),
}));
vi.mock('./aws/ssm/github-webhook-secret-store', () => ({
  createAwsSsmGitHubWebhookSecretStore: vi.fn(),
}));

const createAwsDynamoDbStoreMock = vi.mocked(createAwsDynamoDbGitHubWebhookSecretStore);
const createAwsSsmStoreMock = vi.mocked(createAwsSsmGitHubWebhookSecretStore);
const cleanEnv = process.env;

describe('GitHub webhook secret store selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...cleanEnv };
    delete process.env.RUNNER_CONFIG_STORAGE_PROVIDER;
    resetGitHubWebhookSecretStore();
  });

  it.each([undefined, '', '   ', 'aws_ssm', ' AWS_SSM '])('uses aws_ssm for selector input %j', (provider) => {
    setProvider(provider);
    const store = stubSsmStore();

    expect(getGitHubWebhookSecretStore()).toBe(store);
    expect(createAwsSsmStoreMock).toHaveBeenCalledOnce();
    expect(createAwsDynamoDbStoreMock).not.toHaveBeenCalled();
  });

  it.each(['aws_dynamodb', ' AWS_DYNAMODB '])('uses aws_dynamodb for selector input %j', (provider) => {
    setProvider(provider);
    const store = stubDynamoDbStore();

    expect(getGitHubWebhookSecretStore()).toBe(store);
    expect(createAwsDynamoDbStoreMock).toHaveBeenCalledOnce();
    expect(createAwsSsmStoreMock).not.toHaveBeenCalled();
  });

  it('rejects an unsupported provider before creating a store', () => {
    setProvider('not-registered');

    expect(() => getGitHubWebhookSecretStore()).toThrow("Unsupported runner config storage provider 'not-registered'");
    expect(createAwsSsmStoreMock).not.toHaveBeenCalled();
    expect(createAwsDynamoDbStoreMock).not.toHaveBeenCalled();
  });

  it('creates the selected store lazily and caches it', () => {
    const store = stubSsmStore();

    expect(createAwsSsmStoreMock).not.toHaveBeenCalled();
    const first = getGitHubWebhookSecretStore();
    setProvider('not-registered');
    const second = getGitHubWebhookSecretStore();

    expect(first).toBe(store);
    expect(second).toBe(store);
    expect(createAwsSsmStoreMock).toHaveBeenCalledOnce();
  });

  it('selects again after the test reset', () => {
    const firstStore = stubSsmStore();
    expect(getGitHubWebhookSecretStore()).toBe(firstStore);

    const secondStore = { get: vi.fn() } satisfies GitHubWebhookSecretStore;
    createAwsSsmStoreMock.mockReturnValue(secondStore);
    resetGitHubWebhookSecretStore();

    expect(getGitHubWebhookSecretStore()).toBe(secondStore);
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

function stubSsmStore(): GitHubWebhookSecretStore {
  const store = { get: vi.fn() } satisfies GitHubWebhookSecretStore;
  createAwsSsmStoreMock.mockReturnValue(store);
  return store;
}

function stubDynamoDbStore(): GitHubWebhookSecretStore {
  const store = { get: vi.fn() } satisfies GitHubWebhookSecretStore;
  createAwsDynamoDbStoreMock.mockReturnValue(store);
  return store;
}
