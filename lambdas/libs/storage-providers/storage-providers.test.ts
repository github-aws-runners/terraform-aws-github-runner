import { describe, expect, it, vi } from 'vitest';

import { createStorageProviders } from './storage-providers';

vi.mock('./aws/ssm/runner-config-store', () => ({
  createAwsSsmRunnerConfigStore: vi.fn(() => ({ create: vi.fn() })),
}));
vi.mock('./aws/ssm/runner-group-cache-store', () => ({
  createAwsSsmRunnerGroupCacheStore: vi.fn(() => ({ get: vi.fn(), create: vi.fn() })),
}));
vi.mock('./aws/ssm/runner-config-consumer', () => ({
  createAwsSsmRunnerConfigConsumer: vi.fn(() => ({ consume: vi.fn() })),
}));
vi.mock('./aws/ssm/github-app-credentials-store', () => ({
  createAwsSsmGitHubAppCredentialsStore: vi.fn(() => ({ get: vi.fn() })),
}));

describe('createStorageProviders', () => {
  it('parses environment once and composes independent runner and common capabilities', () => {
    const environment = Object.freeze({
      RUNNER_CONFIG_STORAGE_PROVIDER: 'AWS_SSM',
      SSM_TOKEN_PATH: '/runners/tokens',
      SSM_CONFIG_PATH: '/runners/config',
      SSM_PARAMETER_STORE_TAGS: JSON.stringify([{ Key: 'Environment', Value: 'test' }]),
      PARAMETER_GITHUB_APP_ID_NAME: 'app-id',
      PARAMETER_GITHUB_APP_KEY_BASE64_NAME: 'app-key',
      AWS_SDK_CALL_TIMEOUT_SECONDS: '7',
      RUNNER_CONFIG_TIMEOUT_SECONDS: '11',
      RUNNER_CONFIG_POLL_SECONDS: '2',
      RUNNER_CONFIG_DELETE_ATTEMPTS: '4',
    });

    const storage = createStorageProviders(environment);

    expect(storage).toEqual({
      runnerConfig: expect.any(Object),
      runnerGroupCache: expect.any(Object),
      consumer: expect.any(Object),
      githubAppCredentials: expect.any(Object),
    });
  });
});
