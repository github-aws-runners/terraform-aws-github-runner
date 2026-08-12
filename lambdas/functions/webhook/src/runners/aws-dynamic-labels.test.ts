import type { ComputeProviderType } from '@aws-github-runner/compute-providers/provider-types';
import { describe, expect, it } from 'vitest';

import type { RunnerMatcherConfig } from '../sqs';
import { selectAwsDynamicLabelQueue } from './aws-dynamic-labels';

describe('selectAwsDynamicLabelQueue', () => {
  it('defaults queues without a provider to EC2 dynamic label handling', () => {
    const queue = runnerQueue('default-ec2');

    expect(selectAwsDynamicLabelQueue([queue], ['self-hosted', 'linux'], ['ghr-ec2-instance-type:t3.large'])).toEqual({
      queue,
      labels: ['self-hosted', 'linux', 'ghr-ec2-instance-type:t3.large'],
    });
  });

  it('normalizes compute provider casing and surrounding whitespace', () => {
    const queue = runnerQueue('normalized-ec2');
    (queue as unknown as { computeProvider: string }).computeProvider = ' EC2 ';

    expect(selectAwsDynamicLabelQueue([queue], ['self-hosted', 'linux'], ['ghr-ec2-instance-type:t3.large'])).toEqual({
      queue,
      labels: ['self-hosted', 'linux', 'ghr-ec2-instance-type:t3.large'],
    });
  });

  it('skips an unsupported provider strategy and selects the next supported queue', () => {
    const unsupportedQueue = runnerQueue('unsupported-provider');
    (unsupportedQueue as unknown as { computeProvider: string }).computeProvider = 'unsupported';
    const ec2Queue = runnerQueue('ec2');

    expect(
      selectAwsDynamicLabelQueue(
        [unsupportedQueue, ec2Queue],
        ['self-hosted', 'linux'],
        ['ghr-ec2-instance-type:t3.large'],
      ),
    ).toEqual({
      queue: ec2Queue,
      labels: ['self-hosted', 'linux', 'ghr-ec2-instance-type:t3.large'],
    });
  });

  it('rejects a malformed non-string compute provider without throwing', () => {
    const queue = runnerQueue('malformed-provider');
    (queue as unknown as { computeProvider: number }).computeProvider = 42;

    expect(
      selectAwsDynamicLabelQueue([queue], ['self-hosted', 'linux'], ['ghr-ec2-instance-type:t3.large']),
    ).toBeUndefined();
  });
});

function runnerQueue(id: string, computeProvider?: ComputeProviderType): RunnerMatcherConfig {
  return {
    id,
    arn: `arn:${id}`,
    computeProvider,
    matcherConfig: {
      labelMatchers: [['self-hosted', 'linux']],
      exactMatch: true,
      enableDynamicLabels: true,
    },
  };
}
