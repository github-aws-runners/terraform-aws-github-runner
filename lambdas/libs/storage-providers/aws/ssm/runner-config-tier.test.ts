import { describe, expect, it } from 'vitest';

import { parseSsmRunnerConfigTier } from './runner-config-tier';

describe('parseSsmRunnerConfigTier', () => {
  it.each([
    [undefined, undefined],
    ['', undefined],
    ['  ', undefined],
    ['Standard', 'Standard'],
    ['Advanced', 'Advanced'],
  ])('parses %j to %j', (input, expected) => {
    expect(parseSsmRunnerConfigTier(input)).toBe(expected);
  });

  it.each([['standard'], ['Intelligent-Tiering'], ['premium']])('throws on invalid value %j', (input) => {
    expect(() => parseSsmRunnerConfigTier(input)).toThrow(
      'SSM_RUNNER_CONFIG_TIER must be either "Standard" or "Advanced"',
    );
  });
});
