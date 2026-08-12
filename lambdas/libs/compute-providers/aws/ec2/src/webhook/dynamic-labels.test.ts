import { describe, expect, it } from 'vitest';

import type { RunnerMatcherConfig } from '../../../../contracts';
import { selectEc2DynamicLabelQueue } from './dynamic-labels';

describe('selectEc2DynamicLabelQueue', () => {
  it('enforces a legacy EC2 dynamic labels policy when the new key is absent', () => {
    const queue = runnerQueue('legacy-ec2-policy');
    queue.matcherConfig.ec2DynamicLabelsPolicy = {
      blocked_keys: ['instance-type'],
    };

    expect(
      selectEc2DynamicLabelQueue([queue], ['self-hosted', 'linux'], ['ghr-ec2-instance-type:t3.large']),
    ).toBeUndefined();
  });

  it('falls back to the legacy EC2 dynamic labels policy when the new policy is null', () => {
    const queue = runnerQueue('null-new-policy');
    queue.matcherConfig.ec2DynamicLabelsPolicy = {
      blocked_keys: ['instance-type'],
    };
    queue.matcherConfig.awsDynamicLabelsPolicy = null;

    expect(
      selectEc2DynamicLabelQueue([queue], ['self-hosted', 'linux'], ['ghr-ec2-instance-type:t3.large']),
    ).toBeUndefined();
  });

  it('prefers a configured AWS dynamic labels policy over the legacy policy', () => {
    const queue = runnerQueue('new-policy-precedence');
    queue.matcherConfig.ec2DynamicLabelsPolicy = {
      blocked_keys: ['instance-type'],
    };
    queue.matcherConfig.awsDynamicLabelsPolicy = {
      blocked_keys: [],
    };

    expect(selectEc2DynamicLabelQueue([queue], ['self-hosted', 'linux'], ['ghr-ec2-instance-type:t3.large'])).toEqual({
      queue,
      labels: ['self-hosted', 'linux', 'ghr-ec2-instance-type:t3.large'],
    });
  });
});

function runnerQueue(id: string): RunnerMatcherConfig {
  return {
    id,
    arn: `arn:${id}`,
    computeProvider: 'ec2',
    matcherConfig: {
      labelMatchers: [['self-hosted', 'linux']],
      exactMatch: true,
      enableDynamicLabels: true,
    },
  };
}
