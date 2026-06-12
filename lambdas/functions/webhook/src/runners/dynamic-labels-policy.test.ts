import { describe, it, expect } from 'vitest';

import { violationsAgainstPolicy, type DynamicLabelsPolicy } from './dynamic-labels-policy';

describe('violationsAgainstPolicy', () => {
  it('returns [] when policy is null/undefined', () => {
    expect(violationsAgainstPolicy(['ghr-ec2-instance-type:m5.large'], null)).toEqual([]);
    expect(violationsAgainstPolicy(['ghr-ec2-instance-type:m5.large'], undefined)).toEqual([]);
  });

  it('ignores non ghr-ec2-* labels', () => {
    const policy: DynamicLabelsPolicy = { allowed_keys: ['nope'] };
    expect(violationsAgainstPolicy(['ghr-team:platform', 'self-hosted'], policy)).toEqual([]);
  });

  it('accepts any key when both lists are absent', () => {
    const policy: DynamicLabelsPolicy = {};
    expect(
      violationsAgainstPolicy(['ghr-ec2-instance-type:m5.large', 'ghr-ec2-image-id:ami-1'], policy),
    ).toEqual([]);
  });

  it('flags keys not in allowed_keys', () => {
    const policy: DynamicLabelsPolicy = { allowed_keys: ['instance-type'] };
    const v = violationsAgainstPolicy(
      ['ghr-ec2-instance-type:m5.large', 'ghr-ec2-image-id:ami-1'],
      policy,
    );
    expect(v).toHaveLength(1);
    expect(v[0].label).toBe('ghr-ec2-image-id:ami-1');
  });

  it('denied_keys takes precedence over allowed_keys', () => {
    const policy: DynamicLabelsPolicy = {
      allowed_keys: ['instance-type', 'image-id'],
      denied_keys: ['image-id'],
    };
    const v = violationsAgainstPolicy(
      ['ghr-ec2-instance-type:m5.large', 'ghr-ec2-image-id:ami-1'],
      policy,
    );
    expect(v).toHaveLength(1);
    expect(v[0].label).toBe('ghr-ec2-image-id:ami-1');
  });

  it('per-key allowed glob with `*`', () => {
    const policy: DynamicLabelsPolicy = { 'instance-type': { allowed: ['m5.*', 'c5.*'] } };
    const v = violationsAgainstPolicy(
      ['ghr-ec2-instance-type:m5.large', 'ghr-ec2-instance-type:r5.large'],
      policy,
    );
    expect(v).toHaveLength(1);
    expect(v[0].label).toBe('ghr-ec2-instance-type:r5.large');
  });

  it('per-key allowed glob with `?`', () => {
    const policy: DynamicLabelsPolicy = { 'image-id': { allowed: ['ami-?????????'] } };
    const v = violationsAgainstPolicy(
      ['ghr-ec2-image-id:ami-123456789', 'ghr-ec2-image-id:ami-12345'],
      policy,
    );
    expect(v).toHaveLength(1);
    expect(v[0].label).toBe('ghr-ec2-image-id:ami-12345');
  });

  it('escapes regex metacharacters in patterns', () => {
    const policy: DynamicLabelsPolicy = { 'instance-type': { allowed: ['m5.large'] } };
    const v = violationsAgainstPolicy(['ghr-ec2-instance-type:m5xlarge'], policy);
    expect(v).toHaveLength(1);
  });

  it('empty allowed list is treated as no constraint', () => {
    const policy: DynamicLabelsPolicy = { 'instance-type': { allowed: [] } };
    expect(violationsAgainstPolicy(['ghr-ec2-instance-type:any'], policy)).toEqual([]);
  });

  it('denied glob flags matches', () => {
    const policy: DynamicLabelsPolicy = { 'instance-type': { denied: ['*.metal*'] } };
    const v = violationsAgainstPolicy(
      ['ghr-ec2-instance-type:m5.large', 'ghr-ec2-instance-type:m5.metal'],
      policy,
    );
    expect(v).toHaveLength(1);
    expect(v[0].label).toBe('ghr-ec2-instance-type:m5.metal');
  });

  it('max flags values that exceed', () => {
    const policy: DynamicLabelsPolicy = { 'ebs-volume-size': { max: 200 } };
    const v = violationsAgainstPolicy(
      ['ghr-ec2-ebs-volume-size:100', 'ghr-ec2-ebs-volume-size:300'],
      policy,
    );
    expect(v).toHaveLength(1);
    expect(v[0].label).toBe('ghr-ec2-ebs-volume-size:300');
  });

  it('max flags when value is not numeric', () => {
    const policy: DynamicLabelsPolicy = { 'instance-type': { max: 100 } };
    const v = violationsAgainstPolicy(['ghr-ec2-instance-type:m5.large'], policy);
    expect(v).toHaveLength(1);
  });

  it('empty rule object accepts any value', () => {
    const policy: DynamicLabelsPolicy = { 'instance-type': {} };
    expect(violationsAgainstPolicy(['ghr-ec2-instance-type:any'], policy)).toEqual([]);
  });

  it('accepts a value-less label whose key passes the keys filter', () => {
    const policy: DynamicLabelsPolicy = { allowed_keys: ['no-device'] };
    expect(violationsAgainstPolicy(['ghr-ec2-no-device'], policy)).toEqual([]);
  });

  it('flags a value-less label when allowed_keys excludes it', () => {
    const policy: DynamicLabelsPolicy = { allowed_keys: ['instance-type'] };
    const v = violationsAgainstPolicy(['ghr-ec2-no-device'], policy);
    expect(v).toHaveLength(1);
  });

  it('returns a reason per violating label', () => {
    const policy: DynamicLabelsPolicy = {
      allowed_keys: ['instance-type'],
      'instance-type': { allowed: ['m5.*'] },
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
