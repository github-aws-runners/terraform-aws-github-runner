import { describe, expect, it } from 'vitest';

import type { RunnerMatcherConfig, RunnerProvider } from '../sqs';
import { selectAwsDynamicLabelQueue } from './aws-dynamic-labels';

describe('selectAwsDynamicLabelQueue', () => {
  it('defaults queues without a provider to EC2 dynamic label handling', () => {
    const queue = runnerQueue('default-ec2');

    expect(selectAwsDynamicLabelQueue([queue], ['self-hosted', 'linux'], ['ghr-ec2-instance-type:t3.large'])).toEqual({
      queue,
      labels: ['self-hosted', 'linux', 'ghr-ec2-instance-type:t3.large'],
    });
  });
});

function runnerQueue(id: string, runnerProvider?: RunnerProvider): RunnerMatcherConfig {
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
