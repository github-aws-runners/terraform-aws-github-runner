import { putParameter } from '@aws-github-runner/aws-ssm-util';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAwsSsmRunnerConfigStore } from './runner-config-store';

vi.mock('@aws-github-runner/aws-ssm-util', () => ({
  putParameter: vi.fn(),
}));

const putParameterMock = vi.mocked(putParameter);
const cleanEnv = process.env;

describe('aws_ssm runner config store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...cleanEnv };
    delete process.env.SSM_PARAMETER_STORE_TAGS;
    process.env.SSM_TOKEN_PATH = '/runner/tokens';
  });

  it('creates a secure parameter at the legacy path with metadata tags before configured tags', async () => {
    process.env.SSM_PARAMETER_STORE_TAGS = JSON.stringify([
      { Key: 'Environment', Value: 'test' },
      { Key: 'Team', Value: 'actions' },
    ]);
    const store = createAwsSsmRunnerConfigStore();

    await store.create(
      { runnerId: 'i-123', value: 'encoded-jit-config' },
      { metadata: [{ key: 'InstanceId', value: 'i-123' }] },
    );

    expect(store.maxWritesPerSecond).toBe(40);
    expect(putParameterMock).toHaveBeenCalledWith('/runner/tokens/i-123', 'encoded-jit-config', true, {
      tags: [
        { Key: 'InstanceId', Value: 'i-123' },
        { Key: 'Environment', Value: 'test' },
        { Key: 'Team', Value: 'actions' },
      ],
    });
  });

  it('uses an empty tag list when no tags are configured', async () => {
    const store = createAwsSsmRunnerConfigStore();

    await store.create({ runnerId: 'runner-1', value: 'registration-config' });

    expect(putParameterMock).toHaveBeenCalledWith('/runner/tokens/runner-1', 'registration-config', true, {
      tags: [],
    });
  });

  it.each([undefined, '', '   '])('rejects missing or blank SSM_TOKEN_PATH %j before writing', (tokenPath) => {
    setTokenPath(tokenPath);

    expect(() => createAwsSsmRunnerConfigStore()).toThrow('Environment variable SSM_TOKEN_PATH is not set');
    expect(putParameterMock).not.toHaveBeenCalled();
  });

  it.each([
    ['{}', 'Tags must be an array'],
    ['[null]', 'Tag at index 0 must be an object'],
    [JSON.stringify([{ Key: '', Value: 'test' }]), "Tag at index 0 has missing or invalid 'Key' property"],
    [JSON.stringify([{ Key: 'Environment' }]), "Tag at index 0 has missing or invalid 'Value' property"],
  ])('rejects invalid legacy SSM parameter tags', (tags, reason) => {
    process.env.SSM_PARAMETER_STORE_TAGS = tags;

    expect(() => createAwsSsmRunnerConfigStore()).toThrow(`Failed to parse SSM_PARAMETER_STORE_TAGS: ${reason}`);
    expect(putParameterMock).not.toHaveBeenCalled();
  });

  it('treats a blank legacy tag value as no configured tags', async () => {
    process.env.SSM_PARAMETER_STORE_TAGS = '   ';
    const store = createAwsSsmRunnerConfigStore();

    await store.create({ runnerId: 'runner-1', value: 'jit-config' });

    expect(putParameterMock).toHaveBeenCalledWith('/runner/tokens/runner-1', 'jit-config', true, { tags: [] });
  });
});

function setTokenPath(tokenPath: string | undefined): void {
  if (tokenPath === undefined) {
    delete process.env.SSM_TOKEN_PATH;
  } else {
    process.env.SSM_TOKEN_PATH = tokenPath;
  }
}
