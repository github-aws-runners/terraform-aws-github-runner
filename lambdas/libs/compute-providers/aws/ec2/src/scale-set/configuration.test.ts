import { describe, expect, it } from 'vitest';

import { parseEc2ScaleSetProviderConfig } from './configuration';
import { EC2_SCALE_SET_ID_TAG } from './inventory';
import { config } from './test/fixtures';

describe('EC2 scale-set provider configuration', () => {
  it('strictly parses the supported provider-owned configuration', () => {
    expect(parseEc2ScaleSetProviderConfig(config)).toMatchObject(config);
    expect(parseEc2ScaleSetProviderConfig({ ...config, runnerNamePrefix: '' })).toMatchObject({
      runnerNamePrefix: '',
    });
    expect(parseEc2ScaleSetProviderConfig({ ...config, runnerNamePrefix: 'r'.repeat(45) })).toMatchObject({
      runnerNamePrefix: 'r'.repeat(45),
    });
  });

  it.each([
    [{ ...config, region: 'eu-west-one' }],
    [{ ...config, subnets: ['subnet-12345678', 'subnet-12345678'] }],
    [{ ...config, ec2instanceCriteria: { ...config.ec2instanceCriteria, instanceAllocationStrategy: 'diversified' } }],
    [{ ...config, ec2OverrideConfig: { UserData: 'untrusted' } }],
    [{ ...config, scaleErrors: ['ThrottlingException'] }],
    [{ ...config, ssmParameterTags: [{ Key: 'aws:owner', Value: 'untrusted' }] }],
    [{ ...config, runnerNamePrefix: 'r'.repeat(46) }],
    [{ ...config, bootTimeoutMinutes: 10 }],
  ])('rejects invalid or unsupported values instead of forwarding them to AWS', (invalid) => {
    expect(() => parseEc2ScaleSetProviderConfig(invalid)).toThrow();
  });

  it('does not expose configurable EC2 ownership or lifecycle tags', () => {
    expect(Object.keys(config)).not.toContain('orchestrationTags');
    expect(() =>
      parseEc2ScaleSetProviderConfig({
        ...config,
        orchestrationTags: [{ Key: EC2_SCALE_SET_ID_TAG, Value: 'another-scale-set' }],
      }),
    ).toThrow("Unsupported EC2 scale-set configuration field 'configuration.orchestrationTags'");
  });
});
