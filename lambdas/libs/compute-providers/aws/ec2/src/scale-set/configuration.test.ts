import { describe, expect, it } from 'vitest';

import { parseEc2ScaleSetProviderConfig } from './configuration';
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
});
