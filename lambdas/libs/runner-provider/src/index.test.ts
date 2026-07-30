import { describe, expect, it } from 'vitest';

import { normalizeRunnerProviderType, resolveRunnerProviderType } from './index';

describe('runner provider normalization', () => {
  it.each([
    [undefined, 'ec2'],
    ['', 'ec2'],
    ['   ', 'ec2'],
    [' EC2 ', 'ec2'],
  ])('normalizes provider type %j to %j', (type, expected) => {
    expect(normalizeRunnerProviderType(type)).toBe(expected);
  });

  it.each([[' Unknown '], ['microvm'], [null], [1]])('returns undefined for unsupported provider type %j', (type) => {
    expect(normalizeRunnerProviderType(type)).toBeUndefined();
  });
});

describe('runner provider resolution', () => {
  it.each([
    [undefined, 'ec2'],
    ['', 'ec2'],
    ['   ', 'ec2'],
    [' EC2 ', 'ec2'],
  ])('resolves provider type %j to %j', (type, expected) => {
    expect(resolveRunnerProviderType(type)).toBe(expected);
  });

  it.each([[' Unknown '], ['microvm'], [null], [1]])('rejects unsupported provider type %j', (type) => {
    expect(() => resolveRunnerProviderType(type)).toThrow(`Unsupported runner provider type '${String(type)}'`);
  });
});
