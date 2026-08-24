import { getParameter, putParameter } from '@aws-github-runner/aws-ssm-util';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createRunnerBootstrapStoreFromEnvironment,
  createRunnerGroupCacheStoreFromEnvironment,
  storageProviderRegistry,
} from '..';

vi.mock('@aws-github-runner/aws-ssm-util', () => ({
  getParameter: vi.fn(),
  putParameter: vi.fn(),
}));

const getParameterMock = vi.mocked(getParameter);
const putParameterMock = vi.mocked(putParameter);

describe('aws_ssm storage provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.RUNNER_BOOTSTRAP_STORAGE_PROVIDER_TYPE;
    delete process.env.RUNNER_GROUP_CACHE_STORAGE_PROVIDER_TYPE;
  });

  it('preserves the sensitive runner-bootstrap path, encryption, and tags', async () => {
    const store = createRunnerBootstrapStoreFromEnvironment({
      locator: '/runner/tokens',
      metadataTags: [{ key: 'Environment', value: 'test' }],
    });

    await store.put(
      { identity: { kind: 'runner_bootstrap', runnerId: 'i-123' }, payload: 'jit-payload' },
      { metadataTags: [{ key: 'InstanceId', value: 'i-123' }] },
    );

    expect(store.provider).toBe('aws_ssm');
    expect(store.maxWritesPerSecond).toBe(40);
    expect(putParameterMock).toHaveBeenCalledWith('/runner/tokens/i-123', 'jit-payload', true, {
      tags: [
        { Key: 'InstanceId', Value: 'i-123' },
        { Key: 'Environment', Value: 'test' },
      ],
    });
  });

  it('preserves the rebuildable runner-group cache path and non-secret value type', async () => {
    const store = createRunnerGroupCacheStoreFromEnvironment({
      locator: '/runner/config',
      metadataTags: [{ key: 'Environment', value: 'test' }],
    });
    const identity = { kind: 'runner_group_cache' as const, groupName: 'Default' };
    getParameterMock.mockResolvedValue('1');

    await expect(store.get(identity)).resolves.toEqual({ identity, payload: '1' });
    await store.put({ identity, payload: '2' });

    expect(store.provider).toBe('aws_ssm');
    expect(getParameterMock).toHaveBeenCalledWith('/runner/config/runner-group/Default');
    expect(putParameterMock).toHaveBeenCalledWith('/runner/config/runner-group/Default', '2', false, {
      tags: [{ Key: 'Environment', Value: 'test' }],
    });
  });

  it('selects providers independently for each storage usage', () => {
    process.env.RUNNER_BOOTSTRAP_STORAGE_PROVIDER_TYPE = 'aws_ssm';
    process.env.RUNNER_GROUP_CACHE_STORAGE_PROVIDER_TYPE = 'not-registered';

    expect(
      createRunnerBootstrapStoreFromEnvironment({
        locator: '/runner/tokens',
        metadataTags: [],
      }).provider,
    ).toBe('aws_ssm');
    expect(() =>
      createRunnerGroupCacheStoreFromEnvironment({
        locator: '/runner/config',
        metadataTags: [],
      }),
    ).toThrow("Unsupported storage provider type 'not-registered'");
  });

  it('rejects a capability request for a provider missing from the registry', () => {
    expect(() =>
      storageProviderRegistry.createRunnerBootstrapStore('missing' as 'aws_ssm', {
        locator: '/runner/tokens',
        metadataTags: [],
      }),
    ).toThrow("No storage provider registered for 'missing'");
  });
});
