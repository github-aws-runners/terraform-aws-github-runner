import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAwsSsmGitHubAppCredentialsStore } from './aws/ssm/github-app-credentials-store';
import type { GitHubAppCredentialsStore } from './core';
import { getGitHubAppCredentialsStore, resetGitHubAppCredentialsStore } from './github-app-credentials';

vi.mock('./aws/ssm/github-app-credentials-store', () => ({
  createAwsSsmGitHubAppCredentialsStore: vi.fn(),
}));

const createAwsSsmGitHubAppCredentialsStoreMock = vi.mocked(createAwsSsmGitHubAppCredentialsStore);
const cleanEnv = process.env;

describe('GitHub App credentials store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...cleanEnv };
    delete process.env.RUNNER_CONFIG_STORAGE_PROVIDER;
    resetGitHubAppCredentialsStore();
  });

  it.each([undefined, 'aws_ssm', 'aws_dynamodb', 'not-registered'])(
    'remains on aws_ssm for runner config provider input %j',
    (provider) => {
      setProvider(provider);
      const store = stubStore();

      expect(getGitHubAppCredentialsStore()).toBe(store);
      expect(createAwsSsmGitHubAppCredentialsStoreMock).toHaveBeenCalledOnce();
    },
  );

  it('creates the store lazily and caches it', () => {
    const store = stubStore();

    expect(createAwsSsmGitHubAppCredentialsStoreMock).not.toHaveBeenCalled();
    const first = getGitHubAppCredentialsStore();
    const second = getGitHubAppCredentialsStore();

    expect(first).toBe(store);
    expect(second).toBe(store);
    expect(createAwsSsmGitHubAppCredentialsStoreMock).toHaveBeenCalledOnce();
  });

  it('selects again after the test reset', () => {
    const firstStore = stubStore();
    expect(getGitHubAppCredentialsStore()).toBe(firstStore);

    const secondStore = { get: vi.fn() } satisfies GitHubAppCredentialsStore;
    createAwsSsmGitHubAppCredentialsStoreMock.mockReturnValue(secondStore);
    resetGitHubAppCredentialsStore();

    expect(getGitHubAppCredentialsStore()).toBe(secondStore);
    expect(createAwsSsmGitHubAppCredentialsStoreMock).toHaveBeenCalledTimes(2);
  });
});

function setProvider(provider: string | undefined): void {
  if (provider === undefined) {
    delete process.env.RUNNER_CONFIG_STORAGE_PROVIDER;
  } else {
    process.env.RUNNER_CONFIG_STORAGE_PROVIDER = provider;
  }
}

function stubStore(): GitHubAppCredentialsStore {
  const store = { get: vi.fn() } satisfies GitHubAppCredentialsStore;
  createAwsSsmGitHubAppCredentialsStoreMock.mockReturnValue(store);
  return store;
}
