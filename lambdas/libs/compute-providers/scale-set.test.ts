import { describe, expect, it, vi } from 'vitest';

import { createEc2ScaleSetPlugin } from './aws/ec2/scale-set';
import {
  createScaleSetComputeProviderRegistry,
  type ScaleSetComputeProviderPlugin,
  validateScaleSetProviderEnvironmentVariables,
} from './scale-set';

const configuration = {
  region: 'eu-west-1',
  environment: 'unit-test',
  runnerNamePrefix: 'runner-',
  jitConfigParameterPath: '/github-action-runners/unit-test/runners/tokens',
  subnets: ['subnet-12345678'],
  launchTemplateName: 'unit-test-runners',
  ec2instanceCriteria: {
    instanceTypes: ['m7i.large'],
    targetCapacityType: 'on-demand',
    instanceAllocationStrategy: 'lowest-price',
  },
};

describe('scale-set compute-provider registry', () => {
  it('creates a separate provider instance for every runner config', () => {
    const registry = createScaleSetComputeProviderRegistry([createEc2ScaleSetPlugin()]);
    const first = registry.create('ec2', {
      runnerConfigName: 'shared',
      scaleSetId: 1,
      githubScope: 'https://github.com/first',
      configuration,
    });
    const second = registry.create('ec2', {
      runnerConfigName: 'shared',
      scaleSetId: 1,
      githubScope: 'https://github.com/second',
      configuration,
    });

    expect(first).not.toBe(second);
    expect(first.reconcile).toEqual(expect.any(Function));
    expect(second.reconcile).toEqual(expect.any(Function));
    expect(registry.environmentVariables('ec2')).toEqual({});
    expect(Object.isFrozen(registry.environmentVariables('ec2'))).toBe(true);
  });

  it('rejects duplicate and missing plugins explicitly', () => {
    const plugin: ScaleSetComputeProviderPlugin = {
      type: 'test',
      capabilities: {
        environmentVariables: {},
        create: vi.fn(() => ({ reconcile: vi.fn() })),
      },
    };

    expect(() => createScaleSetComputeProviderRegistry([plugin, plugin])).toThrow(
      "Duplicate scale-set compute provider plugin 'test'",
    );
    expect(() =>
      createScaleSetComputeProviderRegistry([]).create('missing', {
        runnerConfigName: 'runner',
        scaleSetId: 1,
        githubScope: 'https://github.com/example',
        configuration: {},
      }),
    ).toThrow("No scale-set compute provider plugin registered for 'missing'");
    expect(() => createScaleSetComputeProviderRegistry([]).environmentVariables('missing')).toThrow(
      "No scale-set compute provider plugin registered for 'missing'",
    );
  });

  it('returns a validated immutable provider environment', () => {
    const source = { EC2_ENDPOINT_MODE: 'regional' };
    const registry = createScaleSetComputeProviderRegistry([
      {
        type: 'test',
        capabilities: {
          environmentVariables: source,
          create: vi.fn(() => ({ reconcile: vi.fn() })),
        },
      },
    ]);

    const environment = registry.environmentVariables('test');
    source.EC2_ENDPOINT_MODE = 'changed-after-registration';
    expect(environment).toEqual({ EC2_ENDPOINT_MODE: 'regional' });
    expect(Object.isFrozen(environment)).toBe(true);
  });

  it.each<Readonly<Record<string, string>>>([
    { AWS_REGION: 'eu-west-1' },
    { SCALE_SET_OVERRIDE: 'unsafe' },
    { NODE_OPTIONS: '--import=untrusted' },
    { PATH: '/untrusted' },
    { lower_case: 'value' },
    { VALID_NAME: 'line\nbreak' },
    { VALID_NAME: 'x'.repeat(4097) },
  ])('rejects reserved or unsafe provider environment variables: %o', (environmentVariables) => {
    expect(() =>
      createScaleSetComputeProviderRegistry([
        {
          type: 'test',
          capabilities: {
            environmentVariables,
            create: vi.fn(() => ({ reconcile: vi.fn() })),
          },
        },
      ]),
    ).toThrow(/reserved or invalid|invalid value/);
  });

  it('rejects malformed or oversized provider environments', () => {
    expect(() => validateScaleSetProviderEnvironmentVariables(null as never)).toThrow('must be an object');
    expect(() => validateScaleSetProviderEnvironmentVariables([] as never)).toThrow('must be an object');
    expect(() => validateScaleSetProviderEnvironmentVariables({ VALID_NAME: 42 } as never)).toThrow(
      'has an invalid value',
    );
    expect(() =>
      validateScaleSetProviderEnvironmentVariables(
        Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`PROVIDER_${index}`, 'value'])),
      ),
    ).toThrow('must contain at most 64 entries');
  });
});
