import { describe, expect, it } from 'vitest';

import { resolveRunnerProviderType } from './runner-provider';

describe('runner provider selection', () => {
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
