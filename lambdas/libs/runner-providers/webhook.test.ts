import { describe, expect, it, vi } from 'vitest';

import type { DynamicLabelProvider, DynamicLabelViolation, RunnerMatcherConfig } from './contracts';
import { createDynamicLabelQueueSelector } from './webhook';

type TestProvider = 'provider-a' | 'provider-b';

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

  it('skips queues when labels target another provider', () => {
    const firstQueue = runnerQueue('first');
    const secondQueue = runnerQueue('second');
    const { getViolations, selectQueue } = selector({
      providerByQueue: { first: 'provider-a', second: 'provider-b' },
      labelsForOtherProvider: (_labels, provider) => (provider === 'provider-a' ? ['ghr-provider-b-size:large'] : []),
    });

    expect(selectQueue([firstQueue, secondQueue], ['self-hosted'], ['ghr-provider-b-size:large'])).toEqual({
      queue: secondQueue,
      labels: ['self-hosted', 'ghr-provider-b-size:large'],
    });
    expect(getViolations).toHaveBeenCalledOnce();
    expect(getViolations).toHaveBeenCalledWith({ queue: secondQueue, labels: ['ghr-provider-b-size:large'] });
  });
});

function selector(options?: {
  providerByQueue?: Record<string, TestProvider>;
  violationsByQueue?: Record<string, DynamicLabelViolation[]>;
  labelsForOtherProvider?: (labels: string[], provider: TestProvider) => string[];
}) {
  const getViolations = vi.fn<DynamicLabelProvider['getViolations']>(({ queue }) => {
    return options?.violationsByQueue?.[queue.id] ?? [];
  });

  return {
    getViolations,
    selectQueue: createDynamicLabelQueueSelector<TestProvider>({
      resolveProvider: (queue) => ({
        type: options?.providerByQueue?.[queue.id] ?? 'provider-a',
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
