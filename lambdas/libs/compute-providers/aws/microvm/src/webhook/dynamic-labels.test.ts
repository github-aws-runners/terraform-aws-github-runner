import { describe, expect, it } from 'vitest';

import type { RunnerMatcherConfig } from '../../../../contracts';
import { microvmDynamicLabelProvider } from './dynamic-labels';

const imageArn = 'arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner-large';
const egressConnectorArn = 'arn:aws:lambda:eu-west-1:123456789012:network-connector:github-runner-private-egress';

describe('microvmDynamicLabelProvider', () => {
  it('accepts supported MicroVM overrides', () => {
    const queue = microvmQueue();
    queue.matcherConfig.awsDynamicLabelsPolicy = {
      restricted_keys: {
        'egress-network-connectors': { allowed: [egressConnectorArn] },
        'image-arn': { allowed: [imageArn] },
        'image-version': { allowed: ['3.0'] },
      },
    };
    const dynamicLabels = [
      `ghr-microvm-egress-network-connectors:${egressConnectorArn}`,
      `ghr-microvm-image-arn:${imageArn}`,
      'ghr-microvm-image-version:3.0',
    ];

    expect(getViolations(queue, dynamicLabels)).toEqual([]);
  });

  it('requires explicit allowlists for image code and network-boundary overrides', () => {
    expect(
      getViolations(microvmQueue(), [
        `ghr-microvm-egress-network-connectors:${egressConnectorArn}`,
        `ghr-microvm-image-arn:${imageArn}`,
        'ghr-microvm-image-version:3.0',
      ]),
    ).toEqual([
      {
        label: `ghr-microvm-egress-network-connectors:${egressConnectorArn}`,
        reason: "key 'egress-network-connectors' requires an explicit allowed list",
      },
      {
        label: `ghr-microvm-image-arn:${imageArn}`,
        reason: "key 'image-arn' requires an explicit allowed list",
      },
      {
        label: 'ghr-microvm-image-version:3.0',
        reason: "key 'image-version' requires an explicit allowed list",
      },
    ]);
  });

  it.each([
    ['ghr-microvm-memory:8192', "key 'memory' is not a supported MicroVM override"],
    [
      'ghr-microvm-maximum-duration-in-seconds:7200',
      "key 'maximum-duration-in-seconds' is not a supported MicroVM override",
    ],
  ])('preserves the parser violation for %s', (label, reason) => {
    expect(getViolations(microvmQueue(), [label])).toEqual([
      {
        label,
        reason,
      },
    ]);
  });

  it('enforces the AWS dynamic-label policy', () => {
    const queue = microvmQueue();
    queue.matcherConfig.awsDynamicLabelsPolicy = {
      restricted_keys: { 'image-version': { allowed: ['2.*'] } },
    };

    expect(getViolations(queue, ['ghr-microvm-image-version:3.0'])).toEqual([
      {
        label: 'ghr-microvm-image-version:3.0',
        reason: "value '3.0' not in allowed list",
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
  return microvmDynamicLabelProvider.getViolations({
    queue,
    labels,
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
