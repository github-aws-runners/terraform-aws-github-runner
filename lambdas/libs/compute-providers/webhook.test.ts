import { describe, expect, it } from 'vitest';

import type { RunnerMatcherConfig } from './contracts';
import type { ComputeProviderType } from './provider-types';
import { selectDynamicLabelQueue } from './webhook';

describe('selectDynamicLabelQueue', () => {
  it('defaults queues without a provider to EC2 dynamic label handling', () => {
    const queue = runnerQueue('default-ec2');

    expect(selectDynamicLabelQueue([queue], ['self-hosted', 'linux'], ['ghr-ec2-instance-type:t3.large'])).toEqual({
      queue,
      labels: ['self-hosted', 'linux', 'ghr-ec2-instance-type:t3.large'],
    });
  });

  it('normalizes compute provider casing and surrounding whitespace', () => {
    const queue = runnerQueue('normalized-ec2');
    (queue as unknown as { computeProvider: string }).computeProvider = ' EC2 ';

    expect(selectDynamicLabelQueue([queue], ['self-hosted', 'linux'], ['ghr-ec2-instance-type:t3.large'])).toEqual({
      queue,
      labels: ['self-hosted', 'linux', 'ghr-ec2-instance-type:t3.large'],
    });
  });

  it.each([['unsupported'], [42]])('throws for unsupported compute provider %j', (computeProvider) => {
    const queue = runnerQueue('unsupported-provider');
    (queue as unknown as { computeProvider: unknown }).computeProvider = computeProvider;

    expect(() =>
      selectDynamicLabelQueue([queue], ['self-hosted', 'linux'], ['ghr-ec2-instance-type:t3.large']),
    ).toThrow(`Unsupported compute provider type '${String(computeProvider)}'`);
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
