import { describe, expect, it } from 'vitest';

import type { RunnerMatcherConfig } from './contracts';
import type { RunnerProviderType } from './provider-types';
import { selectDynamicLabelQueue } from './webhook';

describe('selectDynamicLabelQueue', () => {
  it('defaults queues without a provider to EC2 dynamic label handling', () => {
    const queue = runnerQueue('default-ec2');

    expect(selectDynamicLabelQueue([queue], ['self-hosted', 'linux'], ['ghr-ec2-instance-type:t3.large'])).toEqual({
      queue,
      labels: ['self-hosted', 'linux', 'ghr-ec2-instance-type:t3.large'],
    });
  });

  it('normalizes runner provider casing and surrounding whitespace', () => {
    const queue = runnerQueue('normalized-ec2');
    (queue as unknown as { runnerProvider: string }).runnerProvider = ' EC2 ';

    expect(selectDynamicLabelQueue([queue], ['self-hosted', 'linux'], ['ghr-ec2-instance-type:t3.large'])).toEqual({
      queue,
      labels: ['self-hosted', 'linux', 'ghr-ec2-instance-type:t3.large'],
    });
  });

  it.each([['unsupported'], [42]])('throws for unsupported runner provider %j', (runnerProvider) => {
    const queue = runnerQueue('unsupported-provider');
    (queue as unknown as { runnerProvider: unknown }).runnerProvider = runnerProvider;

    expect(() =>
      selectDynamicLabelQueue([queue], ['self-hosted', 'linux'], ['ghr-ec2-instance-type:t3.large']),
    ).toThrow(`Unsupported runner provider type '${String(runnerProvider)}'`);
  });

  it('skips EC2 and selects the MicroVM queue for MicroVM override labels', () => {
    const ec2Queue = runnerQueue('ec2', 'ec2');
    const microvmQueue = runnerQueue('microvm', 'microvm');
    const imageVersionLabel = 'ghr-microvm-image-version:3.0';

    expect(selectDynamicLabelQueue([ec2Queue, microvmQueue], ['self-hosted', 'linux'], [imageVersionLabel])).toEqual({
      queue: microvmQueue,
      labels: ['self-hosted', 'linux', imageVersionLabel],
    });
  });

  it('skips MicroVM and selects the EC2 queue for EC2 override labels', () => {
    const microvmQueue = runnerQueue('microvm', 'microvm');
    const ec2Queue = runnerQueue('ec2', 'ec2');
    const instanceTypeLabel = 'ghr-ec2-instance-type:m7i.large';

    expect(selectDynamicLabelQueue([microvmQueue, ec2Queue], ['self-hosted', 'linux'], [instanceTypeLabel])).toEqual({
      queue: ec2Queue,
      labels: ['self-hosted', 'linux', instanceTypeLabel],
    });
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
