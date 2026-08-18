import { getParameter, putParameter } from '@aws-github-runner/aws-ssm-util';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAwsSsmRunnerGroupCacheStore } from './runner-group-cache-store';

vi.mock('@aws-github-runner/aws-ssm-util', () => ({
  getParameter: vi.fn(),
  putParameter: vi.fn(),
}));

const getParameterMock = vi.mocked(getParameter);
const putParameterMock = vi.mocked(putParameter);
const cleanEnv = process.env;

describe('aws_ssm runner group cache store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...cleanEnv };
    delete process.env.SSM_PARAMETER_STORE_TAGS;
    process.env.SSM_CONFIG_PATH = '/runner/config';
  });

  it('gets and parses a runner group id from the legacy path', async () => {
    getParameterMock.mockResolvedValue('42');
    const store = createAwsSsmRunnerGroupCacheStore();

    await expect(store.get('Default')).resolves.toBe(42);
    expect(getParameterMock).toHaveBeenCalledWith('/runner/config/runner-group/Default');
  });

  it('preserves the previous parseInt behavior for cached values', async () => {
    getParameterMock.mockResolvedValue('42cached');
    const store = createAwsSsmRunnerGroupCacheStore();

    await expect(store.get('Default')).resolves.toBe(42);
  });

  it('propagates cache read errors', async () => {
    const error = new Error('not found');
    getParameterMock.mockRejectedValue(error);
    const store = createAwsSsmRunnerGroupCacheStore();

    await expect(store.get('Default')).rejects.toBe(error);
  });

  it('creates a plaintext parameter at the legacy path with configured tags', async () => {
    process.env.SSM_PARAMETER_STORE_TAGS = JSON.stringify([{ Key: 'Environment', Value: 'test' }]);
    const store = createAwsSsmRunnerGroupCacheStore();

    await store.create({ runnerGroupName: 'Default', runnerGroupId: 42 });

    expect(putParameterMock).toHaveBeenCalledWith('/runner/config/runner-group/Default', '42', false, {
      tags: [{ Key: 'Environment', Value: 'test' }],
    });
  });

  it.each([undefined, '', '   '])('rejects missing or blank SSM_CONFIG_PATH %j', (configPath) => {
    setConfigPath(configPath);

    expect(() => createAwsSsmRunnerGroupCacheStore()).toThrow('Environment variable SSM_CONFIG_PATH is not set');
    expect(getParameterMock).not.toHaveBeenCalled();
    expect(putParameterMock).not.toHaveBeenCalled();
  });
});

function setConfigPath(configPath: string | undefined): void {
  if (configPath === undefined) {
    delete process.env.SSM_CONFIG_PATH;
  } else {
    process.env.SSM_CONFIG_PATH = configPath;
  }
}
