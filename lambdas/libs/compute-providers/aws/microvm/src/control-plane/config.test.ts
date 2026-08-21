import { beforeEach, describe, expect, it } from 'vitest';

import { loadMicrovmProviderConfig } from './config';

const cleanEnv = process.env;

beforeEach(() => {
  process.env = { ...cleanEnv };
  process.env.MICROVM_IMAGE_ARN = 'arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner';
  process.env.MICROVM_EXECUTION_ROLE_ARN = 'arn:aws:iam::123456789012:role/microvm-runner';
  process.env.MICROVM_METADATA_SSM_PATH = '/github-action-runners/unit-test/microvm-metadata/';
  delete process.env.MICROVM_METADATA_TAGS;
  delete process.env.MICROVM_IMAGE_VERSION;
  delete process.env.MICROVM_INGRESS_NETWORK_CONNECTORS;
  delete process.env.MICROVM_EGRESS_NETWORK_CONNECTORS;
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
      metadataSsmPath: '/github-action-runners/unit-test/microvm-metadata',
      metadataTags: [],
      logging: undefined,
    });
  });

  it('loads versions, logging, and either connector list format', () => {
    process.env.MICROVM_IMAGE_VERSION = ' 3.0 ';
    process.env.MICROVM_INGRESS_NETWORK_CONNECTORS = '["arn:ingress:one","arn:ingress:two"]';
    process.env.MICROVM_EGRESS_NETWORK_CONNECTORS = 'arn:egress:one, arn:egress:two';
    process.env.MICROVM_LOG_GROUP = ' /aws/lambda-microvms/runner ';
    process.env.MICROVM_METADATA_TAGS = JSON.stringify([
      { Key: 'Name', Value: 'unit-test-runner' },
      { Key: 'ghr:environment', Value: 'unit-test' },
    ]);

    expect(loadMicrovmProviderConfig()).toMatchObject({
      imageVersion: '3.0',
      ingressNetworkConnectors: ['arn:ingress:one', 'arn:ingress:two'],
      egressNetworkConnectors: ['arn:egress:one', 'arn:egress:two'],
      metadataTags: [
        { Key: 'Name', Value: 'unit-test-runner' },
        { Key: 'ghr:environment', Value: 'unit-test' },
      ],
      logging: { cloudWatch: { logGroup: '/aws/lambda-microvms/runner' } },
    });
  });

  it.each([
    ['MICROVM_IMAGE_ARN', 'MICROVM_IMAGE_ARN'],
    ['MICROVM_EXECUTION_ROLE_ARN', 'MICROVM_EXECUTION_ROLE_ARN'],
    ['MICROVM_METADATA_SSM_PATH', 'MICROVM_METADATA_SSM_PATH'],
  ])('requires %s', (environmentVariable, expectedName) => {
    delete process.env[environmentVariable];

    expect(() => loadMicrovmProviderConfig()).toThrow(
      `${expectedName} must be configured for the MicroVM compute provider`,
    );
  });

  it.each(['[not-json', '[]', '["valid", 2]', 'first,'])('rejects malformed connector lists %s', (connectors) => {
    process.env.MICROVM_EGRESS_NETWORK_CONNECTORS = connectors;

    expect(() => loadMicrovmProviderConfig()).toThrow(/MICROVM_EGRESS_NETWORK_CONNECTORS must/);
  });

  it.each(['metadata', '/', '/metadata//nested', '/metadata/has space'])(
    'rejects malformed metadata SSM path %s',
    (metadataPath) => {
      process.env.MICROVM_METADATA_SSM_PATH = metadataPath;

      expect(() => loadMicrovmProviderConfig()).toThrow(
        'MICROVM_METADATA_SSM_PATH must be a valid absolute SSM parameter path',
      );
    },
  );

  it.each([
    '[not-json',
    '{}',
    '[{"Key":"Name"}]',
    '[{"Key":"","Value":"runner"}]',
    '[{"Key":"Name","Value":1}]',
    '[{"Key":"Name","Value":"one"},{"Key":"Name","Value":"two"}]',
  ])('rejects malformed metadata tags %s', (tags) => {
    process.env.MICROVM_METADATA_TAGS = tags;

    expect(() => loadMicrovmProviderConfig()).toThrow(/MICROVM_METADATA_TAGS must/);
  });
});
