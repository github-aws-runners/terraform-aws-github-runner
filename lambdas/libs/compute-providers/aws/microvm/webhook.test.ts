import { describe, expect, it } from 'vitest';

import type { RunnerMatcherConfig } from '../../contracts';
import { provider } from './webhook';

describe('MicroVM webhook provider contract', () => {
  it('exposes MicroVM dynamic-label selection', () => {
    const plugin = provider.createPlugin();
    const queue = microvmQueue();

    expect(plugin.type).toBe('microvm');
    expect(
      plugin.capabilities.dynamicLabels.selectQueue({
        queue,
        nonGhrLabels: ['self-hosted', 'linux'],
        sanitizedGhrLabels: ['ghr-microvm-image-version:3.0'],
      }),
    ).toEqual({
      queue,
      labels: ['self-hosted', 'linux', 'ghr-microvm-image-version:3.0'],
    });
  });
});

function microvmQueue(): RunnerMatcherConfig {
  return {
    id: 'microvm',
    arn: 'arn:aws:sqs:eu-west-1:123456789012:microvm',
    computeProvider: 'microvm',
    matcherConfig: {
      labelMatchers: [['self-hosted', 'linux']],
      exactMatch: true,
      enableDynamicLabels: true,
    },
  };
}
