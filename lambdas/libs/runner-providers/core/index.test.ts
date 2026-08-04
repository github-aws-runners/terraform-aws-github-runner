import { describe, expect, it } from 'vitest';

import { createRunnerProviderRegistry } from './index';

describe('runner provider registry', () => {
  const plugin = {
    type: 'ec2' as const,
    capabilities: {
      scaleUp: () => 'scale-up',
      pool: () => 'pool',
    },
  };
  const registry = createRunnerProviderRegistry([plugin]);

  it('resolves capabilities dynamically', () => {
    expect(registry.capability('ec2', 'scaleUp')()).toBe('scale-up');
    expect(registry.capability('ec2', 'pool')()).toBe('pool');
  });
});
