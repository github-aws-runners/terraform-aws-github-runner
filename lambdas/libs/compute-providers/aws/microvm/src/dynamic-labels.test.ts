import { describe, expect, it } from 'vitest';

import { parseMicrovmDynamicLabels } from './dynamic-labels';

const imageArn = 'arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner-large';
const egressConnectorArn = 'arn:aws:lambda:eu-west-1:123456789012:network-connector:github-runner-private-egress';
const internetEgressConnectorArn =
  'arn:aws:lambda:eu-west-1:aws:network-connector:aws-network-connector:INTERNET_EGRESS';

describe('parseMicrovmDynamicLabels', () => {
  it('parses every supported RunMicrovm override', () => {
    expect(
      parseMicrovmDynamicLabels([
        `ghr-microvm-egress-network-connectors:${egressConnectorArn}`,
        `ghr-microvm-egress-network-connectors:${internetEgressConnectorArn}`,
        `ghr-microvm-image-arn:${imageArn}`,
        'ghr-microvm-image-version:3.0',
        'ghr-microvm-maximum-duration-in-seconds:7200',
      ]),
    ).toEqual({
      overrides: {
        egressNetworkConnectors: [egressConnectorArn, internetEgressConnectorArn],
        imageIdentifier: imageArn,
        imageVersion: '3.0',
        maximumDurationInSeconds: 7200,
      },
      violations: [],
    });
  });

  it.each([
    ['ghr-microvm-memory:8192', "key 'memory' is not a supported MicroVM override"],
    [
      'ghr-microvm-egress-network-connectors:not-an-arn',
      'is not a valid Lambda network connector ARN; specify one ARN per label',
    ],
    [
      `ghr-microvm-egress-network-connectors:${egressConnectorArn};${internetEgressConnectorArn}`,
      'is not a valid Lambda network connector ARN; specify one ARN per label',
    ],
    ['ghr-microvm-image-arn:not-an-arn', 'is not a valid customer MicroVM image ARN'],
    ['ghr-microvm-image-version:', "key 'image-version' requires a value"],
    ['ghr-microvm-maximum-duration-in-seconds:0', 'maximum duration must be an integer between 1 and 28800'],
    ['ghr-microvm-maximum-duration-in-seconds:28801', 'maximum duration must be an integer between 1 and 28800'],
  ])('rejects invalid override %s', (label, reason) => {
    const result = parseMicrovmDynamicLabels([label]);

    expect(result.overrides).toEqual({});
    expect(result.violations).toEqual([{ label, reason: expect.stringContaining(reason) }]);
  });

  it('ignores generic dynamic labels', () => {
    expect(parseMicrovmDynamicLabels(['ghr-team:platform'])).toEqual({ overrides: {}, violations: [] });
  });

  it('rejects more than ten egress network connectors', () => {
    const labels = Array.from(
      { length: 11 },
      (_, index) =>
        `ghr-microvm-egress-network-connectors:arn:aws:lambda:eu-west-1:123456789012:network-connector:connector-${index}`,
    );

    const result = parseMicrovmDynamicLabels(labels);

    expect(result.overrides.egressNetworkConnectors).toHaveLength(10);
    expect(result.violations).toEqual([
      {
        label: labels[10],
        reason: 'at most 10 egress network connector labels are supported',
      },
    ]);
  });
});
