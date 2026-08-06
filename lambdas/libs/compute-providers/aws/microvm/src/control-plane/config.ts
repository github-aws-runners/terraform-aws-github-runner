import type { Logging, RunMicrovmCommandInput } from '@aws-sdk/client-lambda-microvms';

const DEFAULT_MAXIMUM_DURATION_IN_SECONDS = 3600;
const MAXIMUM_DURATION_IN_SECONDS = 28800;

export interface MicrovmProviderConfig {
  egressNetworkConnectors?: string[];
  executionRoleArn: string;
  imageIdentifier: string;
  imageVersion?: string;
  ingressNetworkConnectors?: string[];
  logging?: Logging;
  maximumDurationInSeconds: number;
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

function parseMaximumDuration(value: string | undefined): number {
  if (!optionalEnvironmentValue(value)) return DEFAULT_MAXIMUM_DURATION_IN_SECONDS;

  const maximumDurationInSeconds = Number(value);
  if (
    !Number.isInteger(maximumDurationInSeconds) ||
    maximumDurationInSeconds < 1 ||
    maximumDurationInSeconds > MAXIMUM_DURATION_IN_SECONDS
  ) {
    throw new Error(
      `MICROVM_MAXIMUM_DURATION_IN_SECONDS must be an integer between 1 and ${MAXIMUM_DURATION_IN_SECONDS}`,
    );
  }

  return maximumDurationInSeconds;
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
    maximumDurationInSeconds: parseMaximumDuration(process.env.MICROVM_MAXIMUM_DURATION_IN_SECONDS),
    logging: logGroup ? ({ cloudWatch: { logGroup } } satisfies RunMicrovmCommandInput['logging']) : undefined,
  };
}
