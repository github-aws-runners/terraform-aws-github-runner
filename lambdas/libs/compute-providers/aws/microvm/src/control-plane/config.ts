import type { Logging, RunMicrovmCommandInput } from '@aws-sdk/client-lambda-microvms';

export interface MicrovmProviderConfig {
  egressNetworkConnectors?: string[];
  executionRoleArn: string;
  imageIdentifier: string;
  imageVersion?: string;
  ingressNetworkConnectors?: string[];
  logging?: Logging;
  metadataSsmPath: string;
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
    logging: logGroup ? ({ cloudWatch: { logGroup } } satisfies RunMicrovmCommandInput['logging']) : undefined,
  };
}
