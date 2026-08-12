import { describe, expect, it } from 'vitest';

import {
  defaultComputeProvider,
  normalizeComputeProviderType,
  resolveComputeProviderType,
  computeProviderTypes,
} from './provider-types';

describe('compute provider configuration', () => {
  it('defines an explicit default provider', () => {
    expect(computeProviderTypes).toContain(defaultComputeProvider);
  });
});

describe('compute provider normalization', () => {
  it.each([
    [undefined, 'ec2'],
    ['', 'ec2'],
    ['   ', 'ec2'],
    [' EC2 ', 'ec2'],
  ])('normalizes provider type %j to %j', (type, expected) => {
    expect(normalizeComputeProviderType(type)).toBe(expected);
  });

  it.each([[' Unknown '], ['microvm'], [null], [1]])('returns undefined for unsupported provider type %j', (type) => {
    expect(normalizeComputeProviderType(type)).toBeUndefined();
  });
});

describe('compute provider resolution', () => {
  it.each([
    [undefined, 'ec2'],
    ['', 'ec2'],
    ['   ', 'ec2'],
    [' EC2 ', 'ec2'],
  ])('resolves provider type %j to %j', (type, expected) => {
    expect(resolveComputeProviderType(type)).toBe(expected);
  });

  it.each([[' Unknown '], ['microvm'], [null], [1]])('rejects unsupported provider type %j', (type) => {
    expect(() => resolveComputeProviderType(type)).toThrow(`Unsupported compute provider type '${String(type)}'`);
  });
});
