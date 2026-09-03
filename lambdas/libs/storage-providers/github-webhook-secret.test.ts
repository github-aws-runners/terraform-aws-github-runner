import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAwsSsmGitHubWebhookSecretStore } from './aws/ssm/github-webhook-secret-store';
import type { GitHubWebhookSecretStore } from './core';
import { getGitHubWebhookSecretStore, resetGitHubWebhookSecretStore } from './github-webhook-secret';

vi.mock('./aws/ssm/github-webhook-secret-store', () => ({
  createAwsSsmGitHubWebhookSecretStore: vi.fn(),
}));

const createAwsSsmGitHubWebhookSecretStoreMock = vi.mocked(createAwsSsmGitHubWebhookSecretStore);
const cleanEnv = process.env;

describe('GitHub webhook secret store selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...cleanEnv };
    delete process.env.RUNNER_CONFIG_STORAGE_PROVIDER;
    resetGitHubWebhookSecretStore();
  });

  it.each([undefined, '', '   '])('uses aws_ssm for default selector input %j', (provider) => {
    setProvider(provider);
    const store = stubStore();

    expect(getGitHubWebhookSecretStore()).toBe(store);
    expect(createAwsSsmGitHubWebhookSecretStoreMock).toHaveBeenCalledOnce();
  });

  it.each(['aws_ssm', ' AWS_SSM '])('uses aws_ssm for explicit selector input %j', (provider) => {
    process.env.RUNNER_CONFIG_STORAGE_PROVIDER = provider;
    const store = stubStore();

    expect(getGitHubWebhookSecretStore()).toBe(store);
    expect(createAwsSsmGitHubWebhookSecretStoreMock).toHaveBeenCalledOnce();
  });

  it('rejects an unsupported provider on first use', () => {
    process.env.RUNNER_CONFIG_STORAGE_PROVIDER = 'not-registered';

    expect(() => getGitHubWebhookSecretStore()).toThrow("Unsupported runner config storage provider 'not-registered'");
    expect(createAwsSsmGitHubWebhookSecretStoreMock).not.toHaveBeenCalled();
  });

  it('selects lazily and caches the created store', () => {
    const store = stubStore();

    expect(createAwsSsmGitHubWebhookSecretStoreMock).not.toHaveBeenCalled();
    const first = getGitHubWebhookSecretStore();
    process.env.RUNNER_CONFIG_STORAGE_PROVIDER = 'not-registered';
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
