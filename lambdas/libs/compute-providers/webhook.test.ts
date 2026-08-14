import { describe, expect, it, vi } from 'vitest';

import type { DynamicLabelProvider, DynamicLabelViolation, RunnerMatcherConfig } from './contracts';
import type { ComputeProviderType } from './provider-types';
import { createDynamicLabelQueueSelector, selectDynamicLabelQueue } from './webhook';

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

  it.each([
    ['unsupported string', 'unsupported-provider'],
    ['non-string', 42],
  ])('strictly rejects an %s compute provider', (_description, computeProvider) => {
    const invalidQueue = runnerQueue('invalid-provider');
    (invalidQueue as unknown as { computeProvider: unknown }).computeProvider = computeProvider;

    expect(() =>
      selectDynamicLabelQueue(
        [invalidQueue, runnerQueue('valid-ec2')],
        ['self-hosted', 'linux'],
        ['ghr-ec2-instance-type:t3.large'],
      ),
    ).toThrow(`Unsupported compute provider type '${String(computeProvider)}'`);
  });
});

describe('createDynamicLabelQueueSelector', () => {
  it('returns the first queue accepted by its provider', () => {
    const queue = runnerQueue('accepted');
    const { selectQueue } = selector();

    expect(selectQueue([queue], ['self-hosted', 'linux'], ['ghr-test-size:large'])).toEqual({
      queue,
      labels: ['self-hosted', 'linux', 'ghr-test-size:large'],
    });
  });

  it('skips queues that disable dynamic labels', () => {
    const disabledQueue = runnerQueue('disabled');
    disabledQueue.matcherConfig.enableDynamicLabels = false;
    const enabledQueue = runnerQueue('enabled');
    const { getViolations, selectQueue } = selector();

    expect(selectQueue([disabledQueue, enabledQueue], ['self-hosted'], ['ghr-test-size:large'])).toEqual({
      queue: enabledQueue,
      labels: ['self-hosted', 'ghr-test-size:large'],
    });
    expect(getViolations).toHaveBeenCalledOnce();
    expect(getViolations).toHaveBeenCalledWith({ queue: enabledQueue, labels: ['ghr-test-size:large'] });
  });

  it('skips queues whose provider reports violations', () => {
    const rejectedQueue = runnerQueue('rejected');
    const acceptedQueue = runnerQueue('accepted');
    const { selectQueue } = selector({
      violationsByQueue: {
        rejected: [{ label: 'ghr-test-size:large', reason: 'size is unavailable' }],
      },
    });

    expect(selectQueue([rejectedQueue, acceptedQueue], ['self-hosted'], ['ghr-test-size:large'])).toEqual({
      queue: acceptedQueue,
      labels: ['self-hosted', 'ghr-test-size:large'],
    });
  });

  it('returns undefined when every provider reports violations', () => {
    const queue = runnerQueue('rejected');
    const { selectQueue } = selector({
      violationsByQueue: {
        rejected: [{ label: 'ghr-test-size:large', reason: 'size is unavailable' }],
      },
    });

    expect(selectQueue([queue], ['self-hosted'], ['ghr-test-size:large'])).toBeUndefined();
  });

  /* TODO: Re-enable this scenario when the MicroVM provider is added.
  it('skips EC2 and selects the MicroVM queue for MicroVM override labels', () => {
    const ec2Queue = runnerQueue('ec2');
    const microvmQueue = runnerQueue('microvm');
    const imageVersionLabel = 'ghr-microvm-image-version:3.0';
    const { getViolations, selectQueue } = selector({
      providerByQueue: { ec2: 'ec2', microvm: 'microvm' },
      labelsForOtherProvider: (labels, provider) =>
        provider === 'ec2' ? labels.filter((label) => label.startsWith('ghr-microvm-')) : [],
    });

    expect(selectQueue([ec2Queue, microvmQueue], ['self-hosted', 'linux'], [imageVersionLabel])).toEqual({
      queue: microvmQueue,
      labels: ['self-hosted', 'linux', imageVersionLabel],
    });
    expect(getViolations).toHaveBeenCalledOnce();
    expect(getViolations).toHaveBeenCalledWith({ queue: microvmQueue, labels: [imageVersionLabel] });
  });
  */
});

function selector(options?: {
  providerByQueue?: Record<string, ComputeProviderType>;
  violationsByQueue?: Record<string, DynamicLabelViolation[]>;
  labelsForOtherProvider?: (labels: string[], provider: ComputeProviderType) => string[];
}) {
  const getViolations = vi.fn<DynamicLabelProvider['getViolations']>(({ queue }) => {
    return options?.violationsByQueue?.[queue.id] ?? [];
  });

  return {
    getViolations,
    selectQueue: createDynamicLabelQueueSelector<ComputeProviderType>({
      resolveProvider: (queue) => ({
        type: options?.providerByQueue?.[queue.id] ?? 'ec2',
        dynamicLabels: { getViolations },
      }),
      dynamicLabelsForOtherProvider: options?.labelsForOtherProvider ?? (() => []),
    }),
  };
}

function runnerQueue(id: string): RunnerMatcherConfig {
  return {
    id,
    arn: `arn:${id}`,
    matcherConfig: {
      labelMatchers: [['self-hosted', 'linux']],
      exactMatch: true,
      enableDynamicLabels: true,
    },
  };
}
