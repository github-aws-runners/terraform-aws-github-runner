import { describe, expect, it } from 'vitest';

import { parseSsmTokenTtlSeconds } from './github-runner';

describe('parseSsmTokenTtlSeconds', () => {
  it.each([
    [undefined, undefined],
    ['', undefined],
    ['  ', undefined],
    ['3600', 3600],
    ['1', 1],
  ])('parses %j to %j', (input, expected) => {
    expect(parseSsmTokenTtlSeconds(input)).toBe(expected);
  });

  it.each([['not-a-number'], ['0'], ['-10']])('throws on invalid value %j', (input) => {
    expect(() => parseSsmTokenTtlSeconds(input)).toThrow('SSM_TOKEN_TTL_SECONDS must be a positive number');
  });
});
