import { putParameter } from '@aws-github-runner/aws-ssm-util';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAwsSsmRunnerConfigStore, resolveMaxWritesPerSecond } from './runner-config-store';

vi.mock('@aws-github-runner/aws-ssm-util', () => ({
  putParameter: vi.fn(),
}));

const putParameterMock = vi.mocked(putParameter);
const cleanEnv = process.env;
const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@aws-github-runner/aws-powertools-util', () => ({
  createChildLogger: vi.fn(() => ({
    ...loggerMock,
    appendPersistentKeys: vi.fn(),
  })),
}));

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

  it('uses SSM_PARAMETER_STORE_MAX_WRITES_PER_SECOND when set, e.g. after enabling higher throughput', () => {
    process.env.SSM_PARAMETER_STORE_MAX_WRITES_PER_SECOND = '10000';
    const store = createAwsSsmRunnerConfigStore();
    expect(store.maxWritesPerSecond).toBe(10000);
  });

  it.each([undefined, '', '0', '-5', 'not-a-number'])(
    'falls back to the standard-tier default of 40 for an invalid value (%j)',
    (value) => {
      if (value === undefined) {
        delete process.env.SSM_PARAMETER_STORE_MAX_WRITES_PER_SECOND;
      } else {
        process.env.SSM_PARAMETER_STORE_MAX_WRITES_PER_SECOND = value;
      }
      const store = createAwsSsmRunnerConfigStore();
      expect(store.maxWritesPerSecond).toBe(40);
    },
  );

  it('honors an explicitly configured maxWritesPerSecond over the default', () => {
    const store = createAwsSsmRunnerConfigStore({
      tokenPath: '/runner/tokens',
      parameterStoreTags: [],
      maxWritesPerSecond: 1000,
    });
    expect(store.maxWritesPerSecond).toBe(1000);
  });

  it('logs safe context when a runner configuration write fails', async () => {
    const error = Object.assign(new Error('encoded-jit-secret'), { name: 'ThrottlingException' });
    putParameterMock.mockRejectedValue(error);

    await expect(
      createAwsSsmRunnerConfigStore().create({ runnerId: 'runner-1', value: 'encoded-jit-secret' }),
    ).rejects.toBe(error);

    expect(loggerMock.error).toHaveBeenCalledWith('Failed to write runner configuration', {
      runnerId: 'runner-1',
      parameterName: '/runner/tokens/runner-1',
      errorNames: ['ThrottlingException'],
    });
    expect(JSON.stringify(loggerMock.error.mock.calls)).not.toContain('encoded-jit-secret');
  });
});

describe('resolveMaxWritesPerSecond', () => {
  it.each([
    ['10000', 10000],
    ['1', 1],
    [undefined, 40],
    ['', 40],
    ['0', 40],
    ['-1', 40],
    ['not-a-number', 40],
  ])('resolves %j to %i', (rawValue, expected) => {
    expect(resolveMaxWritesPerSecond(rawValue)).toBe(expected);
  });
});

function setTokenPath(tokenPath: string | undefined): void {
  if (tokenPath === undefined) {
    delete process.env.SSM_TOKEN_PATH;
  } else {
    process.env.SSM_TOKEN_PATH = tokenPath;
  }
}
