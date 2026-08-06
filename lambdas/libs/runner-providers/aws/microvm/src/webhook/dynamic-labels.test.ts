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

    expect(getViolations(queue, dynamicLabels)).toEqual([]);
  });

  it('rejects unsupported MicroVM resource overrides', () => {
    expect(getViolations(microvmQueue(), ['ghr-microvm-memory:8192'])).toEqual([
      {
        label: 'ghr-microvm-memory:8192',
        reason: "key 'memory' is not a supported MicroVM override",
      },
    ]);
  });

  it('enforces the AWS dynamic-label policy', () => {
    const queue = microvmQueue();
    queue.matcherConfig.awsDynamicLabelsPolicy = {
      restricted_keys: { 'maximum-duration-in-seconds': { max: 3600 } },
    };

    expect(getViolations(queue, ['ghr-microvm-maximum-duration-in-seconds:7200'])).toEqual([
      {
        label: 'ghr-microvm-maximum-duration-in-seconds:7200',
        reason: "value '7200' exceeds max '3600'",
      },
    ]);
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
      getViolations(queue, [
        'ghr-microvm-image-arn:arn:aws:lambda:eu-west-1:123456789012:microvm-image:approved-large',
      ]),
    ).toEqual([]);
    expect(
      getViolations(queue, ['ghr-microvm-image-arn:arn:aws:lambda:eu-west-1:123456789012:microvm-image:unapproved']),
    ).toHaveLength(1);
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
      getViolations(queue, [
        'ghr-microvm-egress-network-connectors:arn:aws:lambda:eu-west-1:123456789012:network-connector:approved-private',
      ]),
    ).toEqual([]);
    expect(
      getViolations(queue, [
        'ghr-microvm-egress-network-connectors:arn:aws:lambda:eu-west-1:123456789012:network-connector:unapproved',
      ]),
    ).toHaveLength(1);
  });
});

function getViolations(queue: RunnerMatcherConfig, labels: string[]) {
  return microvmDynamicLabelProvider.getViolations({ queue, labels });
}

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
