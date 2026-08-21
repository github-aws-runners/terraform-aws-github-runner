import type { Logging, RunMicrovmCommandInput } from '@aws-sdk/client-lambda-microvms';

export interface MicrovmMetadataTag {
  Key: string;
  Value: string;
}

export interface MicrovmProviderConfig {
  egressNetworkConnectors?: string[];
  executionRoleArn: string;
  imageIdentifier: string;
  imageVersion?: string;
  ingressNetworkConnectors?: string[];
  logging?: Logging;
  metadataSsmPath: string;
  metadataTags: MicrovmMetadataTag[];
  runnerConfigSsmArn: string;
}

function requiredEnvironmentValue(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${name} must be configured for the MicroVM compute provider`);
  }
  return trimmed;
}

function optionalEnvironmentValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseMetadataSsmPath(value: string | undefined): string {
  const path = requiredEnvironmentValue('MICROVM_METADATA_SSM_PATH', value).replace(/\/+$/, '');
  if (path === '' || !/^\/[A-Za-z0-9_.\-/]+$/.test(path) || path.includes('//')) {
    throw new Error('MICROVM_METADATA_SSM_PATH must be a valid absolute SSM parameter path');
  }
  return path;
}

function parseRunnerConfigSsmArn(value: string | undefined): string {
  const arn = requiredEnvironmentValue('MICROVM_RUNNER_CONFIG_SSM_ARN', value);
  if (
    !/^arn:aws(?:-[a-z0-9-]+)?:ssm:[A-Za-z0-9-]+:\d{12}:parameter\/[A-Za-z0-9_.\-/]+$/.test(arn) ||
    arn.includes('//') ||
    arn.split('/').includes('..')
  ) {
    throw new Error('MICROVM_RUNNER_CONFIG_SSM_ARN must be a valid SSM parameter ARN prefix');
  }
  return arn;
}

function parseNetworkConnectors(name: string, value: string | undefined): string[] | undefined {
  const configuredValue = optionalEnvironmentValue(value);
  if (!configuredValue) return undefined;

  let connectors: unknown;
  try {
    connectors = configuredValue.startsWith('[')
      ? JSON.parse(configuredValue)
      : configuredValue.split(',').map((connector) => connector.trim());
  } catch (error) {
    throw new Error(`${name} must be a JSON array or comma-separated list`, { cause: error });
  }

  if (
    !Array.isArray(connectors) ||
    connectors.length === 0 ||
    connectors.some((connector) => typeof connector !== 'string' || connector.trim().length === 0)
  ) {
    throw new Error(`${name} must contain one or more non-empty connector ARNs`);
  }

  return connectors.map((connector) => connector.trim());
}

function parseMetadataTags(value: string | undefined): MicrovmMetadataTag[] {
  const configuredValue = optionalEnvironmentValue(value);
  if (!configuredValue) return [];

  let tags: unknown;
  try {
    tags = JSON.parse(configuredValue);
  } catch (error) {
    throw new Error('MICROVM_METADATA_TAGS must be a JSON array of SSM tag objects', { cause: error });
  }

  if (
    !Array.isArray(tags) ||
    tags.some(
      (tag) =>
        typeof tag !== 'object' ||
        tag === null ||
        !('Key' in tag) ||
        typeof tag.Key !== 'string' ||
        tag.Key.length === 0 ||
        !('Value' in tag) ||
        typeof tag.Value !== 'string',
    )
  ) {
    throw new Error('MICROVM_METADATA_TAGS must be a JSON array of SSM tag objects');
  }

  const typedTags = tags as MicrovmMetadataTag[];
  if (new Set(typedTags.map((tag) => tag.Key)).size !== typedTags.length) {
    throw new Error('MICROVM_METADATA_TAGS must not contain duplicate tag keys');
  }

  return typedTags;
}

export function loadMicrovmProviderConfig(): MicrovmProviderConfig {
  const logGroup = optionalEnvironmentValue(process.env.MICROVM_LOG_GROUP);

  return {
    imageIdentifier: requiredEnvironmentValue('MICROVM_IMAGE_ARN', process.env.MICROVM_IMAGE_ARN),
    imageVersion: optionalEnvironmentValue(process.env.MICROVM_IMAGE_VERSION),
    executionRoleArn: requiredEnvironmentValue('MICROVM_EXECUTION_ROLE_ARN', process.env.MICROVM_EXECUTION_ROLE_ARN),
    ingressNetworkConnectors: parseNetworkConnectors(
      'MICROVM_INGRESS_NETWORK_CONNECTORS',
      process.env.MICROVM_INGRESS_NETWORK_CONNECTORS,
    ),
    egressNetworkConnectors: parseNetworkConnectors(
      'MICROVM_EGRESS_NETWORK_CONNECTORS',
      process.env.MICROVM_EGRESS_NETWORK_CONNECTORS,
    ),
    metadataSsmPath: parseMetadataSsmPath(process.env.MICROVM_METADATA_SSM_PATH),
    metadataTags: parseMetadataTags(process.env.MICROVM_METADATA_TAGS),
    runnerConfigSsmArn: parseRunnerConfigSsmArn(process.env.MICROVM_RUNNER_CONFIG_SSM_ARN),
    logging: logGroup ? ({ cloudWatch: { logGroup } } satisfies RunMicrovmCommandInput['logging']) : undefined,
  };
}
