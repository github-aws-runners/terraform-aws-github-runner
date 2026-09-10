import { describe, expect, it } from 'vitest';

import { computeProviderTypes, defaultComputeProvider, resolveComputeProviderType } from './provider-types';

const defaultProviderInputs = [undefined, '', '   '] as const;
const supportedProviderCases = computeProviderTypes.flatMap(
  (provider) =>
    [
      [provider, provider],
      [` ${provider.toUpperCase()} `, provider],
    ] as const,
);

describe('compute provider configuration', () => {
  it('defines an explicit default provider', () => {
    expect(computeProviderTypes).toContain(defaultComputeProvider);
  });
});

describe('compute provider resolution', () => {
  it.each(defaultProviderInputs)('resolves default provider input %j', (type) => {
    expect(resolveComputeProviderType(type)).toBe(defaultComputeProvider);
  });

  it.each(supportedProviderCases)('resolves provider type %j to %j', (type, expected) => {
    expect(resolveComputeProviderType(type)).toBe(expected);
  });

  it.each([[' Unknown '], ['unsupported-provider'], [null], [1]])('rejects unsupported provider type %j', (type) => {
    expect(() => resolveComputeProviderType(type)).toThrow(`Unsupported compute provider type '${String(type)}'`);
  });
});
