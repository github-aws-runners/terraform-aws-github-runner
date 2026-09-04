import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getParameter, putParameter } from '@aws-github-runner/aws-ssm-util';

import { createAwsSsmRunnerGroupCacheStore } from './runner-group-cache-store';

vi.mock('@aws-github-runner/aws-ssm-util', () => ({
  getParameter: vi.fn(),
  putParameter: vi.fn(),
}));

const getParameterMock = vi.mocked(getParameter);
const putParameterMock = vi.mocked(putParameter);

describe('aws_ssm runner group cache store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SSM_CONFIG_PATH = '/runner/config';
    delete process.env.SSM_PARAMETER_STORE_TAGS;
  });

  it('returns a cached numeric ID and preserves configured tags on create', async () => {
    process.env.SSM_PARAMETER_STORE_TAGS = JSON.stringify([{ Key: 'Environment', Value: 'test' }]);
    getParameterMock.mockResolvedValue('42');
    const store = createAwsSsmRunnerGroupCacheStore();

    await expect(store.get('Default')).resolves.toBe(42);
    await store.create({ runnerGroupName: 'Default', runnerGroupId: 42 });

    expect(getParameterMock).toHaveBeenCalledWith('/runner/config/runner-group/Default');
    expect(putParameterMock).toHaveBeenCalledWith('/runner/config/runner-group/Default', '42', false, {
      tags: [{ Key: 'Environment', Value: 'test' }],
    });
  });

  it('returns undefined only for ParameterNotFound', async () => {
    getParameterMock.mockRejectedValue(Object.assign(new Error('missing'), { name: 'ParameterNotFound' }));

    await expect(createAwsSsmRunnerGroupCacheStore().get('Default')).resolves.toBeUndefined();
  });

  it('propagates access and service errors', async () => {
    const error = Object.assign(new Error('denied'), { name: 'AccessDeniedException' });
    getParameterMock.mockRejectedValue(error);

    await expect(createAwsSsmRunnerGroupCacheStore().get('Default')).rejects.toBe(error);
  });

  it('rejects a non-numeric cached ID', async () => {
    getParameterMock.mockResolvedValue('not-a-number');

    await expect(createAwsSsmRunnerGroupCacheStore().get('Default')).rejects.toThrow(/cached runner group ID/i);
  });
});
