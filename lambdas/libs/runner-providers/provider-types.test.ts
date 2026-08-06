import { describe, expect, it } from 'vitest';

import { defaultRunnerProvider, resolveRunnerProviderType, runnerProviderTypes } from './provider-types';

const defaultProviderInputs = [undefined, '', '   '] as const;
const supportedProviderCases = runnerProviderTypes.flatMap(
  (provider) =>
    [
      [provider, provider],
      [` ${provider.toUpperCase()} `, provider],
    ] as const,
);

describe('runner provider configuration', () => {
  it('defines an explicit default provider', () => {
    expect(runnerProviderTypes).toContain(defaultRunnerProvider);
  });
});

describe('runner provider resolution', () => {
  it.each(defaultProviderInputs)('resolves default provider input %j', (type) => {
    expect(resolveRunnerProviderType(type)).toBe(defaultRunnerProvider);
  });

  it.each(supportedProviderCases)('resolves provider type %j to %j', (type, expected) => {
    expect(resolveRunnerProviderType(type)).toBe(expected);
  });

  it.each([[' Unknown '], ['unsupported-provider'], [null], [1]])('rejects unsupported provider type %j', (type) => {
    expect(() => resolveRunnerProviderType(type)).toThrow(`Unsupported runner provider type '${String(type)}'`);
  });
});
