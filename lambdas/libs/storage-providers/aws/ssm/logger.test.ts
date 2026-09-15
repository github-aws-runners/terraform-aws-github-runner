import { describe, expect, it, vi } from 'vitest';

import { runnerConfigStorageProvider } from '../../provider';
import { createAwsSsmStorageLogger, getErrorNames } from './logger';

const loggerMock = vi.hoisted(() => ({
  appendPersistentKeys: vi.fn(),
}));
const createChildLoggerMock = vi.hoisted(() => vi.fn(() => loggerMock));

vi.mock('@aws-github-runner/aws-powertools-util', () => ({
  createChildLogger: createChildLoggerMock,
}));

describe('AWS SSM storage logger', () => {
  it('adds the canonical storage provider while preserving the adapter module', () => {
    expect(createAwsSsmStorageLogger('runner-config-store')).toBe(loggerMock);
    expect(createChildLoggerMock).toHaveBeenCalledWith('runner-config-store');
    expect(loggerMock.appendPersistentKeys).toHaveBeenCalledWith({
      storageProvider: runnerConfigStorageProvider.awsSsm,
    });
  });

  it('returns bounded error names from a cause chain', () => {
    const cause = Object.assign(new Error('missing'), { name: 'ParameterNotFound' });
    const error = Object.assign(new Error('wrapped'), { name: 'GetParameterError', cause });
    Object.assign(cause, { cause: error });

    expect(getErrorNames(error)).toEqual(['GetParameterError', 'ParameterNotFound']);
  });

  it('detects a namespaced __type instead of name (raw SSM GetParameter error shape)', () => {
    const cause = { message: 'missing', __type: 'com.amazonaws.ssm#ParameterNotFound' };
    const error = Object.assign(new Error('wrapped'), { name: 'GetParameterError', cause });

    expect(getErrorNames(error)).toEqual(['GetParameterError', 'ParameterNotFound']);
  });
});
