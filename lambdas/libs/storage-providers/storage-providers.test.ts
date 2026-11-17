import { describe, expect, it, vi } from 'vitest';

import { createAwsSsmRunnerConfigStore } from './aws/ssm/runner-config-store';

import { createCommonStorage, createStorageProviders } from './storage-providers';
import { getGitHubAppCredentialsStore } from './github-app-credentials';
import { getRunnerConfigStore } from './runner-config';
import { getRunnerGroupCacheStore } from './runner-group-cache';

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

vi.mock('./runner-config', () => ({ getRunnerConfigStore: vi.fn(() => ({ create: vi.fn() })) }));
vi.mock('./runner-group-cache', () => ({ getRunnerGroupCacheStore: vi.fn(() => ({ get: vi.fn(), create: vi.fn() })) }));
vi.mock('./github-app-credentials', () => ({ getGitHubAppCredentialsStore: vi.fn(() => ({ get: vi.fn() })) }));

describe('createStorageProviders with aws_dynamodb', () => {
  it('composes the DynamoDB-backed stores without SSM paths and without a consumer', () => {
    const storage = createStorageProviders({ RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_dynamodb' });

    expect(getRunnerConfigStore).toHaveBeenCalled();
    expect(getRunnerGroupCacheStore).toHaveBeenCalled();
    expect(getGitHubAppCredentialsStore).toHaveBeenCalled();
    expect(storage.consumer).toBeUndefined();
    expect(Object.keys(storage).sort()).toEqual(['githubAppCredentials', 'runnerConfig', 'runnerGroupCache']);
  });

  it('selects the DynamoDB GitHub App credentials store for common storage', () => {
    createCommonStorage({ RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_dynamodb' });

    expect(getGitHubAppCredentialsStore).toHaveBeenCalled();
  });
});

describe('createStorageProviders', () => {
  it('parses environment once and composes independent runner and common capabilities', () => {
    const environment = Object.freeze({
      RUNNER_CONFIG_STORAGE_PROVIDER: 'AWS_SSM',
      SSM_TOKEN_PATH: '/runners/tokens',
      SSM_TOKEN_TTL_SECONDS: '3600',
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

    expect(createAwsSsmRunnerConfigStore).toHaveBeenCalledWith(expect.objectContaining({ tokenTtlSeconds: 3600 }));
    expect(storage).toEqual({
      runnerConfig: expect.any(Object),
      runnerGroupCache: expect.any(Object),
      consumer: expect.any(Object),
      githubAppCredentials: expect.any(Object),
    });
  });

  it('rejects an invalid token TTL before creating a storage provider', () => {
    vi.clearAllMocks();
    expect(() =>
      createStorageProviders({ SSM_TOKEN_PATH: '/runners/tokens', SSM_TOKEN_TTL_SECONDS: 'not-a-number' }),
    ).toThrow('SSM_TOKEN_TTL_SECONDS must be a positive number');
    expect(createAwsSsmRunnerConfigStore).not.toHaveBeenCalled();
  });
});
