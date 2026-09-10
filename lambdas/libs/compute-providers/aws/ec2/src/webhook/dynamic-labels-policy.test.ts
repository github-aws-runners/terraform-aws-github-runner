import { describe, it, expect } from 'vitest';

import { violationsAgainstPolicy, type Ec2DynamicLabelsPolicy } from './dynamic-labels-policy';

describe('violationsAgainstPolicy', () => {
  it('returns [] when policy is null/undefined', () => {
    expect(violationsAgainstPolicy(['ghr-ec2-instance-type:m5.large'], null)).toEqual([]);
    expect(violationsAgainstPolicy(['ghr-ec2-instance-type:m5.large'], undefined)).toEqual([]);
  });

  it('accepts any key when no policy entries match', () => {
    const policy: Ec2DynamicLabelsPolicy = {};
    expect(violationsAgainstPolicy(['ghr-ec2-instance-type:m5.large', 'ghr-ec2-image-id:ami-1'], policy)).toEqual([]);
  });

  it('accepts keys not listed in blocked_keys or restricted_keys', () => {
    const policy: Ec2DynamicLabelsPolicy = {
      blocked_keys: ['image-id'],
      restricted_keys: {
        'instance-type': { allowed: ['m5.*'] },
      },
    };
    expect(violationsAgainstPolicy(['ghr-ec2-ebs-volume-size:300'], policy)).toEqual([]);
  });

  it('flags keys in blocked_keys', () => {
    const policy: Ec2DynamicLabelsPolicy = { blocked_keys: ['image-id'] };
    const v = violationsAgainstPolicy(['ghr-ec2-instance-type:m5.large', 'ghr-ec2-image-id:ami-1'], policy);
    expect(v).toHaveLength(1);
    expect(v[0].label).toBe('ghr-ec2-image-id:ami-1');
  });

  it('blocked_keys takes precedence over restricted_keys', () => {
    const policy: Ec2DynamicLabelsPolicy = {
      blocked_keys: ['image-id'],
      restricted_keys: {
        'image-id': { allowed: ['ami-*'] },
      },
    };
    const v = violationsAgainstPolicy(['ghr-ec2-image-id:ami-1'], policy);
    expect(v).toHaveLength(1);
    expect(v[0].label).toBe('ghr-ec2-image-id:ami-1');
  });

  it('restricted key allowed glob with `*`', () => {
    const policy: Ec2DynamicLabelsPolicy = { restricted_keys: { 'instance-type': { allowed: ['m5.*', 'c5.*'] } } };
    const v = violationsAgainstPolicy(['ghr-ec2-instance-type:m5.large', 'ghr-ec2-instance-type:r5.large'], policy);
    expect(v).toHaveLength(1);
    expect(v[0].label).toBe('ghr-ec2-instance-type:r5.large');
  });

  it('restricted key allowed glob with `?`', () => {
    const policy: Ec2DynamicLabelsPolicy = { restricted_keys: { 'image-id': { allowed: ['ami-?????????'] } } };
    const v = violationsAgainstPolicy(['ghr-ec2-image-id:ami-123456789', 'ghr-ec2-image-id:ami-12345'], policy);
    expect(v).toHaveLength(1);
    expect(v[0].label).toBe('ghr-ec2-image-id:ami-12345');
  });

  it('escapes regex metacharacters in patterns', () => {
    const policy: Ec2DynamicLabelsPolicy = { restricted_keys: { 'instance-type': { allowed: ['m5.large'] } } };
    const v = violationsAgainstPolicy(['ghr-ec2-instance-type:m5xlarge'], policy);
    expect(v).toHaveLength(1);
  });

  it('empty allowed list is treated as no constraint', () => {
    const policy: Ec2DynamicLabelsPolicy = { restricted_keys: { 'instance-type': { allowed: [] } } };
    expect(violationsAgainstPolicy(['ghr-ec2-instance-type:any'], policy)).toEqual([]);
  });

  it('denied glob flags matches', () => {
    const policy: Ec2DynamicLabelsPolicy = { restricted_keys: { 'instance-type': { denied: ['*.metal*'] } } };
    const v = violationsAgainstPolicy(['ghr-ec2-instance-type:m5.large', 'ghr-ec2-instance-type:m5.metal'], policy);
    expect(v).toHaveLength(1);
    expect(v[0].label).toBe('ghr-ec2-instance-type:m5.metal');
  });

  it('max flags values that exceed', () => {
    const policy: Ec2DynamicLabelsPolicy = { restricted_keys: { 'ebs-volume-size': { max: 200 } } };
    const v = violationsAgainstPolicy(['ghr-ec2-ebs-volume-size:100', 'ghr-ec2-ebs-volume-size:300'], policy);
    expect(v).toHaveLength(1);
    expect(v[0].label).toBe('ghr-ec2-ebs-volume-size:300');
  });

  it('max flags when value is not numeric', () => {
    const policy: Ec2DynamicLabelsPolicy = { restricted_keys: { 'instance-type': { max: 100 } } };
    const v = violationsAgainstPolicy(['ghr-ec2-instance-type:m5.large'], policy);
    expect(v).toHaveLength(1);
  });

  it('empty rule object accepts any value', () => {
    const policy: Ec2DynamicLabelsPolicy = { restricted_keys: { 'instance-type': {} } };
    expect(violationsAgainstPolicy(['ghr-ec2-instance-type:any'], policy)).toEqual([]);
  });

  it('accepts a value-less label whose key is not blocked', () => {
    const policy: Ec2DynamicLabelsPolicy = { restricted_keys: { 'no-device': {} } };
    expect(violationsAgainstPolicy(['ghr-ec2-no-device'], policy)).toEqual([]);
  });

  it('flags a value-less label when blocked_keys includes it', () => {
    const policy: Ec2DynamicLabelsPolicy = { blocked_keys: ['no-device'] };
    const v = violationsAgainstPolicy(['ghr-ec2-no-device'], policy);
    expect(v).toHaveLength(1);
  });

  it('returns a reason per violating label', () => {
    const policy: Ec2DynamicLabelsPolicy = {
      blocked_keys: ['image-id'],
      restricted_keys: {
        'instance-type': { allowed: ['m5.*'] },
      },
    };
    const v = violationsAgainstPolicy(
      ['ghr-ec2-instance-type:r5.large', 'ghr-ec2-image-id:ami-x', 'ghr-ec2-instance-type:m5.large'],
      policy,
    );
    expect(v).toHaveLength(2);
    expect(v[0].label).toBe('ghr-ec2-instance-type:r5.large');
    expect(v[1].label).toBe('ghr-ec2-image-id:ami-x');
  });
});
