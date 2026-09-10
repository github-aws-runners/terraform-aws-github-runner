import { describe, expect, it, vi } from 'vitest';

import type { DynamicLabelProvider, DynamicLabelViolation, RunnerMatcherConfig } from './contracts';
import { dynamicLabelsForOtherProvider } from './dynamic-labels';
import { createDynamicLabelQueueSelector, selectDynamicLabelQueue } from './webhook';

const testProviderTypes = ['alpha', 'beta'] as const;
type TestProviderType = (typeof testProviderTypes)[number];

describe('selectDynamicLabelQueue', () => {
  it.each([
    ['unsupported string', 'unsupported-provider'],
    ['non-string', 42],
  ])('strictly rejects an %s compute provider', (_description, computeProvider) => {
    const invalidQueue = runnerQueue('invalid-provider');
    (invalidQueue as unknown as { computeProvider: unknown }).computeProvider = computeProvider;

    expect(() => selectDynamicLabelQueue([invalidQueue], [], [])).toThrow(
      `Unsupported compute provider type '${String(computeProvider)}'`,
    );
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

  it('selects the queue targeted by provider-specific labels', () => {
    const alphaQueue = runnerQueue('alpha');
    const betaQueue = runnerQueue('beta');
    const betaLabel = 'ghr-beta-size:large';
    const { getViolations, selectQueue } = selector({
      providerByQueue: { alpha: 'alpha', beta: 'beta' },
    });

    expect(selectQueue([alphaQueue, betaQueue], ['self-hosted', 'linux'], [betaLabel])).toEqual({
      queue: betaQueue,
      labels: ['self-hosted', 'linux', betaLabel],
    });
    expect(getViolations).toHaveBeenCalledOnce();
    expect(getViolations).toHaveBeenCalledWith({ queue: betaQueue, labels: [betaLabel] });
  });
});

function selector(options?: {
  providerByQueue?: Record<string, TestProviderType>;
  violationsByQueue?: Record<string, DynamicLabelViolation[]>;
}) {
  const getViolations = vi.fn<DynamicLabelProvider['getViolations']>(({ queue }) => {
    return options?.violationsByQueue?.[queue.id] ?? [];
  });

  return {
    getViolations,
    selectQueue: createDynamicLabelQueueSelector<TestProviderType>({
      resolveProvider: (queue) => ({
        type: options?.providerByQueue?.[queue.id] ?? 'alpha',
        dynamicLabels: { getViolations },
      }),
      dynamicLabelsForOtherProvider: (labels, provider) =>
        dynamicLabelsForOtherProvider(labels, provider, testProviderTypes),
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
