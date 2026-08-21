import { describe, expect, it } from 'vitest';

import type { RunnerMatcherConfig } from '../../../../contracts';
import { ec2DynamicLabelProvider } from './dynamic-labels';

describe('ec2DynamicLabelProvider', () => {
  it('returns no violations when the queue has no policy', () => {
    const queue = runnerQueue('no-policy');

    expect(getViolations(queue)).toEqual([]);
  });

  it('returns violations for labels rejected by the policy', () => {
    const strictQueue = runnerQueue('strict');
    strictQueue.matcherConfig.awsDynamicLabelsPolicy = {
      restricted_keys: {
        'instance-type': { allowed: ['m5.*'] },
      },
    };

    expect(getViolations(strictQueue)).toEqual([
      {
        label: 'ghr-ec2-instance-type:t3.large',
        reason: "value 't3.large' not in allowed list",
      },
    ]);
  });

  it('enforces a legacy EC2 dynamic labels policy when the new key is absent', () => {
    const queue = runnerQueue('legacy-ec2-policy');
    queue.matcherConfig.ec2DynamicLabelsPolicy = {
      blocked_keys: ['instance-type'],
    };

    expect(getViolations(queue)).toHaveLength(1);
  });

  it('falls back to the legacy EC2 dynamic labels policy when the new policy is null', () => {
    const queue = runnerQueue('null-new-policy');
    queue.matcherConfig.ec2DynamicLabelsPolicy = {
      blocked_keys: ['instance-type'],
    };
    queue.matcherConfig.awsDynamicLabelsPolicy = null;

    expect(getViolations(queue)).toHaveLength(1);
  });

  it('prefers a configured AWS dynamic labels policy over the legacy policy', () => {
    const queue = runnerQueue('new-policy-precedence');
    queue.matcherConfig.ec2DynamicLabelsPolicy = {
      blocked_keys: ['instance-type'],
    };
    queue.matcherConfig.awsDynamicLabelsPolicy = {
      blocked_keys: [],
    };

    expect(getViolations(queue)).toEqual([]);
  });
});

function getViolations(queue: RunnerMatcherConfig) {
  return ec2DynamicLabelProvider.getViolations({
    queue,
    labels: ['ghr-ec2-instance-type:t3.large'],
  });
}

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
