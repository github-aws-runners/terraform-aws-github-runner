import { beforeEach, describe, expect, it } from 'vitest';

import { loadMicrovmProviderConfig } from './config';

const cleanEnv = process.env;

beforeEach(() => {
  process.env = { ...cleanEnv };
  process.env.MICROVM_IMAGE_ARN = 'arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner';
  process.env.MICROVM_EXECUTION_ROLE_ARN = 'arn:aws:iam::123456789012:role/microvm-runner';
  delete process.env.MICROVM_IMAGE_VERSION;
  delete process.env.MICROVM_INGRESS_NETWORK_CONNECTORS;
  delete process.env.MICROVM_EGRESS_NETWORK_CONNECTORS;
  delete process.env.MICROVM_MAXIMUM_DURATION_IN_SECONDS;
  delete process.env.MICROVM_LOG_GROUP;
});

describe('loadMicrovmProviderConfig', () => {
  it('loads required values and applies optional defaults', () => {
    expect(loadMicrovmProviderConfig()).toEqual({
      imageIdentifier: process.env.MICROVM_IMAGE_ARN,
      imageVersion: undefined,
      executionRoleArn: process.env.MICROVM_EXECUTION_ROLE_ARN,
      ingressNetworkConnectors: undefined,
      egressNetworkConnectors: undefined,
      maximumDurationInSeconds: 3600,
      logging: undefined,
    });
  });

  it('loads versions, logging, duration, and either connector list format', () => {
    process.env.MICROVM_IMAGE_VERSION = ' 3.0 ';
    process.env.MICROVM_INGRESS_NETWORK_CONNECTORS = '["arn:ingress:one","arn:ingress:two"]';
    process.env.MICROVM_EGRESS_NETWORK_CONNECTORS = 'arn:egress:one, arn:egress:two';
    process.env.MICROVM_MAXIMUM_DURATION_IN_SECONDS = '1200';
    process.env.MICROVM_LOG_GROUP = ' /aws/lambda-microvms/runner ';

    expect(loadMicrovmProviderConfig()).toMatchObject({
      imageVersion: '3.0',
      ingressNetworkConnectors: ['arn:ingress:one', 'arn:ingress:two'],
      egressNetworkConnectors: ['arn:egress:one', 'arn:egress:two'],
      maximumDurationInSeconds: 1200,
      logging: { cloudWatch: { logGroup: '/aws/lambda-microvms/runner' } },
    });
  });

  it.each([
    ['MICROVM_IMAGE_ARN', 'MICROVM_IMAGE_ARN'],
    ['MICROVM_EXECUTION_ROLE_ARN', 'MICROVM_EXECUTION_ROLE_ARN'],
  ])('requires %s', (environmentVariable, expectedName) => {
    delete process.env[environmentVariable];

    expect(() => loadMicrovmProviderConfig()).toThrow(
      `${expectedName} must be configured for the MicroVM compute provider`,
    );
  });

  it.each(['0', '28801', '1.5', 'invalid'])('rejects invalid maximum duration %s', (duration) => {
    process.env.MICROVM_MAXIMUM_DURATION_IN_SECONDS = duration;

    expect(() => loadMicrovmProviderConfig()).toThrow(
      'MICROVM_MAXIMUM_DURATION_IN_SECONDS must be an integer between 1 and 28800',
    );
  });

  it.each(['[not-json', '[]', '["valid", 2]', 'first,'])('rejects malformed connector lists %s', (connectors) => {
    process.env.MICROVM_EGRESS_NETWORK_CONNECTORS = connectors;

    expect(() => loadMicrovmProviderConfig()).toThrow(/MICROVM_EGRESS_NETWORK_CONNECTORS must/);
  });
});
