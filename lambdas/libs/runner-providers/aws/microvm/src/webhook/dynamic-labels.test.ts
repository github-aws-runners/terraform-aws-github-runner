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

    expect(
      microvmDynamicLabelProvider.selectQueue({
        queue,
        nonGhrLabels: ['self-hosted', 'microvm'],
        sanitizedGhrLabels: dynamicLabels,
      }),
    ).toEqual({ queue, labels: ['self-hosted', 'microvm', ...dynamicLabels] });
  });

  it('rejects unsupported MicroVM resource overrides', () => {
    expect(
      microvmDynamicLabelProvider.selectQueue({
        queue: microvmQueue(),
        nonGhrLabels: ['self-hosted', 'microvm'],
        sanitizedGhrLabels: ['ghr-microvm-memory:8192'],
      }),
    ).toBeUndefined();
  });

  it('rejects labels owned by another runner provider', () => {
    expect(
      microvmDynamicLabelProvider.selectQueue({
        queue: microvmQueue(),
        nonGhrLabels: ['self-hosted', 'microvm'],
        sanitizedGhrLabels: ['ghr-ec2-instance-type:m7i.large'],
      }),
    ).toBeUndefined();
  });

  it('requires dynamic labels to be enabled for the queue', () => {
    const queue = microvmQueue();
    queue.matcherConfig.enableDynamicLabels = false;

    expect(
      microvmDynamicLabelProvider.selectQueue({
        queue,
        nonGhrLabels: ['self-hosted', 'microvm'],
        sanitizedGhrLabels: ['ghr-microvm-image-version:3.0'],
      }),
    ).toBeUndefined();
  });

  it('enforces the AWS dynamic-label policy', () => {
    const queue = microvmQueue();
    queue.matcherConfig.awsDynamicLabelsPolicy = {
      restricted_keys: { 'maximum-duration-in-seconds': { max: 3600 } },
    };

    expect(
      microvmDynamicLabelProvider.selectQueue({
        queue,
        nonGhrLabels: ['self-hosted', 'microvm'],
        sanitizedGhrLabels: ['ghr-microvm-maximum-duration-in-seconds:7200'],
      }),
    ).toBeUndefined();
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
      microvmDynamicLabelProvider.selectQueue({
        queue,
        nonGhrLabels: ['self-hosted', 'microvm'],
        sanitizedGhrLabels: [
          'ghr-microvm-image-arn:arn:aws:lambda:eu-west-1:123456789012:microvm-image:approved-large',
        ],
      }),
    ).toBeDefined();
    expect(
      microvmDynamicLabelProvider.selectQueue({
        queue,
        nonGhrLabels: ['self-hosted', 'microvm'],
        sanitizedGhrLabels: ['ghr-microvm-image-arn:arn:aws:lambda:eu-west-1:123456789012:microvm-image:unapproved'],
      }),
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
      microvmDynamicLabelProvider.selectQueue({
        queue,
        nonGhrLabels: ['self-hosted', 'microvm'],
        sanitizedGhrLabels: [
          'ghr-microvm-egress-network-connectors:arn:aws:lambda:eu-west-1:123456789012:network-connector:approved-private',
        ],
      }),
    ).toBeDefined();
    expect(
      microvmDynamicLabelProvider.selectQueue({
        queue,
        nonGhrLabels: ['self-hosted', 'microvm'],
        sanitizedGhrLabels: [
          'ghr-microvm-egress-network-connectors:arn:aws:lambda:eu-west-1:123456789012:network-connector:unapproved',
        ],
      }),
    ).toBeUndefined();
  });
});

function microvmQueue(): RunnerMatcherConfig {
  return {
    id: 'microvm',
    arn: 'arn:aws:sqs:eu-west-1:123456789012:microvm',
    runnerProvider: 'microvm',
    matcherConfig: {
      labelMatchers: [['self-hosted', 'linux', 'arm64', 'microvm']],
      exactMatch: false,
      enableDynamicLabels: true,
    },
  };
}
