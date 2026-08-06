import { describe, expect, it } from 'vitest';

import type { RunnerMatcherConfig } from '../../../../contracts';
import { microvmDynamicLabelProvider } from './dynamic-labels';

const imageArn = 'arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner-large';
const egressConnectorArn = 'arn:aws:lambda:eu-west-1:123456789012:network-connector:github-runner-private-egress';

describe('microvmDynamicLabelProvider', () => {
  it('accepts supported MicroVM overrides', () => {
    const queue = microvmQueue();
    const dynamicLabels = [
      `ghr-microvm-egress-network-connectors:${egressConnectorArn}`,
      `ghr-microvm-image-arn:${imageArn}`,
      'ghr-microvm-image-version:3.0',
      'ghr-microvm-maximum-duration-in-seconds:7200',
    ];

    expect(selectQueue(queue, dynamicLabels)).toEqual({
      queue,
      labels: ['self-hosted', 'linux', ...dynamicLabels],
    });
  });

  it('rejects dynamic labels when the queue disables them', () => {
    const queue = microvmQueue();
    queue.matcherConfig.enableDynamicLabels = false;

    expect(selectQueue(queue, ['ghr-microvm-image-version:3.0'])).toBeUndefined();
  });

  it('rejects unsupported MicroVM resource overrides', () => {
    expect(selectQueue(microvmQueue(), ['ghr-microvm-memory:8192'])).toBeUndefined();
  });

  it('enforces the AWS dynamic-label policy', () => {
    const queue = microvmQueue();
    queue.matcherConfig.awsDynamicLabelsPolicy = {
      restricted_keys: { 'maximum-duration-in-seconds': { max: 3600 } },
    };

    expect(selectQueue(queue, ['ghr-microvm-maximum-duration-in-seconds:7200'])).toBeUndefined();
  });

  it('applies allowed patterns to the complete image ARN', () => {
    const queue = microvmQueue();
    queue.matcherConfig.awsDynamicLabelsPolicy = {
      restricted_keys: {
        'image-arn': {
          allowed: ['arn:aws:lambda:eu-west-1:123456789012:microvm-image:approved-*'],
        },
      },
    };

    expect(
      selectQueue(queue, ['ghr-microvm-image-arn:arn:aws:lambda:eu-west-1:123456789012:microvm-image:approved-large']),
    ).toBeDefined();
    expect(
      selectQueue(queue, ['ghr-microvm-image-arn:arn:aws:lambda:eu-west-1:123456789012:microvm-image:unapproved']),
    ).toBeUndefined();
  });

  it('applies the policy to each egress connector label', () => {
    const queue = microvmQueue();
    queue.matcherConfig.awsDynamicLabelsPolicy = {
      restricted_keys: {
        'egress-network-connectors': {
          allowed: ['arn:aws:lambda:eu-west-1:123456789012:network-connector:approved-*'],
        },
      },
    };

    expect(
      selectQueue(queue, [
        'ghr-microvm-egress-network-connectors:arn:aws:lambda:eu-west-1:123456789012:network-connector:approved-private',
      ]),
    ).toBeDefined();
    expect(
      selectQueue(queue, [
        'ghr-microvm-egress-network-connectors:arn:aws:lambda:eu-west-1:123456789012:network-connector:unapproved',
      ]),
    ).toBeUndefined();
  });
});

function selectQueue(queue: RunnerMatcherConfig, sanitizedGhrLabels: string[]) {
  return microvmDynamicLabelProvider.selectQueue({
    queue,
    nonGhrLabels: ['self-hosted', 'linux'],
    sanitizedGhrLabels,
  });
}

function microvmQueue(): RunnerMatcherConfig {
  return {
    id: 'microvm',
    arn: 'arn:aws:sqs:eu-west-1:123456789012:microvm',
    computeProvider: 'microvm',
    matcherConfig: {
      labelMatchers: [['self-hosted', 'linux', 'arm64', 'microvm']],
      exactMatch: false,
      enableDynamicLabels: true,
    },
  };
}
