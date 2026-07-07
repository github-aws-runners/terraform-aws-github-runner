import { describe, expect, it } from 'vitest';

import { getScaleUpRunnerProviderType } from './scale-up-config';

describe('getScaleUpRunnerProviderType', () => {
  it('defaults to ec2 when no type is defined', () => {
    expect(getScaleUpRunnerProviderType(undefined, 'ec2')).toEqual('ec2');
  });

  it('uses configured ec2 type', () => {
    expect(getScaleUpRunnerProviderType('ec2', 'microvm')).toEqual('ec2');
  });
});
