import { describe, expect, it, vi } from 'vitest';

import { computeProvider } from '../../provider-types';
import { createEc2ComputeProviderLogger } from './logger';

const loggerMock = vi.hoisted(() => ({
  appendPersistentKeys: vi.fn(),
}));
const createChildLoggerMock = vi.hoisted(() => vi.fn(() => loggerMock));

vi.mock('@aws-github-runner/aws-powertools-util', () => ({
  createChildLogger: createChildLoggerMock,
}));

describe('EC2 compute provider logger', () => {
  it('adds the canonical compute provider while preserving the module name', () => {
    expect(createEc2ComputeProviderLogger('runners')).toBe(loggerMock);
    expect(createChildLoggerMock).toHaveBeenCalledWith('runners');
    expect(loggerMock.appendPersistentKeys).toHaveBeenCalledWith({
      computeProvider: computeProvider.ec2,
    });
  });
});
