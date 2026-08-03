import type { RunnerProviderType } from '@aws-github-runner/runner-providers/provider-types';
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

  it('normalizes runner provider casing and surrounding whitespace', () => {
    const queue = runnerQueue('normalized-ec2');
    (queue as unknown as { runnerProvider: string }).runnerProvider = ' EC2 ';

    expect(selectAwsDynamicLabelQueue([queue], ['self-hosted', 'linux'], ['ghr-ec2-instance-type:t3.large'])).toEqual({
      queue,
      labels: ['self-hosted', 'linux', 'ghr-ec2-instance-type:t3.large'],
    });
  });

  it('skips an unsupported provider strategy and selects the next supported queue', () => {
    const unsupportedQueue = runnerQueue('unsupported-provider');
    (unsupportedQueue as unknown as { runnerProvider: string }).runnerProvider = 'unsupported';
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

  it('rejects a malformed non-string runner provider without throwing', () => {
    const queue = runnerQueue('malformed-provider');
    (queue as unknown as { runnerProvider: number }).runnerProvider = 42;

    expect(
      selectAwsDynamicLabelQueue([queue], ['self-hosted', 'linux'], ['ghr-ec2-instance-type:t3.large']),
    ).toBeUndefined();
  });
});

function runnerQueue(id: string, runnerProvider?: RunnerProviderType): RunnerMatcherConfig {
  return {
    id,
    arn: `arn:${id}`,
    runnerProvider,
    matcherConfig: {
      labelMatchers: [['self-hosted', 'linux']],
      exactMatch: true,
      enableDynamicLabels: true,
    },
  };
}
