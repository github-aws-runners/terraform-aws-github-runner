import { describe, expect, it } from 'vitest';

import { createPoolRunnerProviderFromEnv } from './pool/pool-provider-registry';
import { normalizeRunnerProviderType } from './runner-provider';
import { createScaleDownRunnerProviderFromEnv } from './scale-runners/scale-down-provider-registry';
import { createScaleUpRunnerProviderFromEnv } from './scale-runners/scale-up-provider-registry';

describe('runner provider selection', () => {
  it.each([[' EC2 ', 'ec2']])('normalizes provider type %j to %j', (type, expected) => {
    expect(normalizeRunnerProviderType(type)).toBe(expected);
  });

  it('selects the EC2 scale-down provider case-insensitively', () => {
    expect(createScaleDownRunnerProviderFromEnv(' EC2 ')).toMatchObject({
      type: 'ec2',
      name: 'EC2',
    });
  });

  it('quotes the original unsupported pool provider type', () => {
    expect(() => createPoolRunnerProviderFromEnv(' Unknown ')).toThrow(
      "Unsupported pool runner provider type ' Unknown '",
    );
  });

  it('quotes the original unsupported scale-up provider type', () => {
    expect(() => createScaleUpRunnerProviderFromEnv(' Unknown ', 'test', [])).toThrow(
      "Unsupported scale-up runner provider type ' Unknown '",
    );
  });

  it('quotes the original unsupported scale-down provider type', () => {
    expect(() => createScaleDownRunnerProviderFromEnv(' Unknown ')).toThrow(
      "Unsupported scale-down runner provider type ' Unknown '",
    );
  });
});
