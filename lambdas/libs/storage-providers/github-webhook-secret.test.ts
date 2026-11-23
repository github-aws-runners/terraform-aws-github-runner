import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAwsSsmGitHubWebhookSecretStore } from './aws/ssm/github-webhook-secret-store';
import type { GitHubWebhookSecretStore } from './core';
import { getGitHubWebhookSecretStore, resetGitHubWebhookSecretStore } from './github-webhook-secret';

vi.mock('./aws/ssm/github-webhook-secret-store', () => ({
  createAwsSsmGitHubWebhookSecretStore: vi.fn(),
}));

const createAwsSsmGitHubWebhookSecretStoreMock = vi.mocked(createAwsSsmGitHubWebhookSecretStore);
const cleanEnv = process.env;

describe('GitHub webhook secret store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...cleanEnv };
    delete process.env.RUNNER_CONFIG_STORAGE_PROVIDER;
    resetGitHubWebhookSecretStore();
  });

  it.each([undefined, 'aws_ssm', 'aws_dynamodb', 'not-registered'])(
    'remains on aws_ssm for runner config provider input %j',
    (provider) => {
      setProvider(provider);
      const store = stubStore();

      expect(getGitHubWebhookSecretStore()).toBe(store);
      expect(createAwsSsmGitHubWebhookSecretStoreMock).toHaveBeenCalledOnce();
    },
  );

  it('creates the store lazily and caches it', () => {
    const store = stubStore();

    expect(createAwsSsmGitHubWebhookSecretStoreMock).not.toHaveBeenCalled();
    const first = getGitHubWebhookSecretStore();
    const second = getGitHubWebhookSecretStore();

    expect(first).toBe(store);
    expect(second).toBe(store);
    expect(createAwsSsmGitHubWebhookSecretStoreMock).toHaveBeenCalledOnce();
  });

  it('selects again after the test reset', () => {
    const firstStore = stubStore();
    expect(getGitHubWebhookSecretStore()).toBe(firstStore);

    const secondStore = { get: vi.fn() } satisfies GitHubWebhookSecretStore;
    createAwsSsmGitHubWebhookSecretStoreMock.mockReturnValue(secondStore);
    resetGitHubWebhookSecretStore();

    expect(getGitHubWebhookSecretStore()).toBe(secondStore);
    expect(createAwsSsmGitHubWebhookSecretStoreMock).toHaveBeenCalledTimes(2);
  });
});

function setProvider(provider: string | undefined): void {
  if (provider === undefined) {
    delete process.env.RUNNER_CONFIG_STORAGE_PROVIDER;
  } else {
    process.env.RUNNER_CONFIG_STORAGE_PROVIDER = provider;
  }
}

function stubStore(): GitHubWebhookSecretStore {
  const store = { get: vi.fn() } satisfies GitHubWebhookSecretStore;
  createAwsSsmGitHubWebhookSecretStoreMock.mockReturnValue(store);
  return store;
}
