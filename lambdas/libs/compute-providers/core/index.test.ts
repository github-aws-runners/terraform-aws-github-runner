import { describe, expect, it } from 'vitest';

import { computeProvider } from '../provider-types';
import { createComputeProviderRegistry } from './index';

describe('compute provider registry', () => {
  const plugin = {
    type: computeProvider.ec2,
    capabilities: {
      scaleUp: () => 'scale-up',
      pool: () => 'pool',
    },
  };
  const registry = createComputeProviderRegistry([plugin]);

  it('resolves capabilities dynamically', () => {
    expect(registry.capability(computeProvider.ec2, 'scaleUp')()).toBe('scale-up');
    expect(registry.capability(computeProvider.ec2, 'pool')()).toBe('pool');
  });
});
