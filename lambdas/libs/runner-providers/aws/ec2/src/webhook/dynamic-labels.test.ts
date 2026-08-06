import { describe, expect, it } from 'vitest';

import type { RunnerMatcherConfig } from '../../../../contracts';
import { selectEc2DynamicLabelQueue } from './dynamic-labels';

describe('selectEc2DynamicLabelQueue', () => {
  it('rejects dynamic labels when the queue disables them', () => {
    const queue = runnerQueue('dynamic-labels-disabled');
    queue.matcherConfig.enableDynamicLabels = false;

    expect(
      selectEc2DynamicLabelQueue([queue], ['self-hosted', 'linux'], ['ghr-ec2-instance-type:t3.large']),
    ).toBeUndefined();
  });

  it('accepts dynamic labels when the queue has no policy', () => {
    const queue = runnerQueue('no-policy');

    expect(selectEc2DynamicLabelQueue([queue], ['self-hosted', 'linux'], ['ghr-ec2-instance-type:t3.large'])).toEqual({
      queue,
      labels: ['self-hosted', 'linux', 'ghr-ec2-instance-type:t3.large'],
    });
  });

  it('skips a policy-rejected queue and returns the next compliant queue', () => {
    const strictQueue = runnerQueue('strict');
    strictQueue.matcherConfig.awsDynamicLabelsPolicy = {
      restricted_keys: {
        'instance-type': { allowed: ['m5.*'] },
      },
    };
    const permissiveQueue = runnerQueue('permissive');

    expect(
      selectEc2DynamicLabelQueue(
        [strictQueue, permissiveQueue],
        ['self-hosted', 'linux'],
        ['ghr-ec2-instance-type:t3.large'],
      ),
    ).toEqual({
      queue: permissiveQueue,
      labels: ['self-hosted', 'linux', 'ghr-ec2-instance-type:t3.large'],
    });
  });

  it('returns undefined when no queue accepts the dynamic labels', () => {
    const strictQueue = runnerQueue('strict');
    strictQueue.matcherConfig.awsDynamicLabelsPolicy = {
      restricted_keys: {
        'instance-type': { allowed: ['m5.*'] },
      },
    };
    const disabledQueue = runnerQueue('disabled');
    disabledQueue.matcherConfig.enableDynamicLabels = false;

    expect(
      selectEc2DynamicLabelQueue(
        [strictQueue, disabledQueue],
        ['self-hosted', 'linux'],
        ['ghr-ec2-instance-type:t3.large'],
      ),
    ).toBeUndefined();
  });

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
    runnerProvider: 'ec2',
    matcherConfig: {
      labelMatchers: [['self-hosted', 'linux']],
      exactMatch: true,
      enableDynamicLabels: true,
    },
  };
}
