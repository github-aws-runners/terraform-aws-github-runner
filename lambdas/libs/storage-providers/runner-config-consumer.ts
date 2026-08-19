import {
  createAwsDynamoDbRunnerConfigConsumer,
  type AwsDynamoDbRunnerConfigApi,
} from './aws/dynamodb/runner-config-consumer';
import { createAwsSsmRunnerConfigConsumer, type AwsSsmRunnerConfigApi } from './aws/ssm/runner-config-consumer';
import type { RunnerConfigConsumer, RunnerConfigStorageContext, RunnerConfigStorageEnvironment } from './core';
import {
  canonicalSsmTokenPath,
  validateDynamoDbTableName,
  type RunnerConfigPollingOptions,
} from './runner-config-consumer-common';

export type {
  AwsDynamoDbRunnerConfigStorageEnvironment,
  AwsSsmRunnerConfigStorageEnvironment,
  RunnerConfigConsumeOptions,
  RunnerConfigConsumer,
  RunnerConfigStorageContext,
  RunnerConfigStorageEnvironment,
} from './core';
export type { AwsDynamoDbRunnerConfigApi } from './aws/dynamodb/runner-config-consumer';
export type { AwsSsmRunnerConfigApi } from './aws/ssm/runner-config-consumer';

const STORAGE_PROVIDER_ENVIRONMENT_VARIABLE = 'RUNNER_CONFIG_STORAGE_PROVIDER';
const SSM_TOKEN_PATH_ENVIRONMENT_VARIABLE = 'SSM_TOKEN_PATH';
const DYNAMODB_TABLE_ENVIRONMENT_VARIABLE = 'RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME';
const STORAGE_ENVIRONMENT_VARIABLES = [
  STORAGE_PROVIDER_ENVIRONMENT_VARIABLE,
  SSM_TOKEN_PATH_ENVIRONMENT_VARIABLE,
  DYNAMODB_TABLE_ENVIRONMENT_VARIABLE,
] as const;

type Environment = Readonly<Record<string, string | undefined>>;
type MutableEnvironment = Record<string, string | undefined>;

export interface RunnerConfigConsumerConfig extends RunnerConfigPollingOptions {
  awsDynamoDbApi?: AwsDynamoDbRunnerConfigApi;
  awsSsmApi?: AwsSsmRunnerConfigApi;
  deleteAttempts?: number;
}

export function parseRunnerConfigStorageContext(value: unknown): RunnerConfigStorageContext {
  if (!isPlainObject(value) || typeof value.RUNNER_CONFIG_STORAGE_PROVIDER !== 'string') {
    throw new Error('runner configuration storage context is invalid');
  }

  if (value.RUNNER_CONFIG_STORAGE_PROVIDER === 'aws_ssm') {
    if (
      !hasExactKeys(value, [STORAGE_PROVIDER_ENVIRONMENT_VARIABLE, SSM_TOKEN_PATH_ENVIRONMENT_VARIABLE]) ||
      typeof value.SSM_TOKEN_PATH !== 'string'
    ) {
      throw new Error('aws_ssm runner configuration storage context is invalid');
    }
    return Object.freeze({
      RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_ssm',
      SSM_TOKEN_PATH: canonicalSsmTokenPath(value.SSM_TOKEN_PATH),
    });
  }

  if (value.RUNNER_CONFIG_STORAGE_PROVIDER === 'aws_dynamodb') {
    if (
      !hasExactKeys(value, [STORAGE_PROVIDER_ENVIRONMENT_VARIABLE, DYNAMODB_TABLE_ENVIRONMENT_VARIABLE]) ||
      typeof value.RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME !== 'string'
    ) {
      throw new Error('aws_dynamodb runner configuration storage context is invalid');
    }
    return Object.freeze({
      RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_dynamodb',
      RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME: validateDynamoDbTableName(
        value.RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME,
      ),
    });
  }

  throw new Error('runner configuration storage provider is unsupported');
}

/** Selects only the consumer-safe storage variables from a broader producer environment. */
export function loadRunnerConfigStorageContextFromEnvironment(
  environment: Environment = process.env,
): RunnerConfigStorageContext {
  const configuredProvider = environment[STORAGE_PROVIDER_ENVIRONMENT_VARIABLE];
  const provider =
    configuredProvider === undefined || configuredProvider.trim() === '' ? 'aws_ssm' : configuredProvider;

  if (provider === 'aws_ssm') {
    return parseRunnerConfigStorageContext({
      RUNNER_CONFIG_STORAGE_PROVIDER: provider,
      SSM_TOKEN_PATH: environment[SSM_TOKEN_PATH_ENVIRONMENT_VARIABLE],
    });
  }
  if (provider === 'aws_dynamodb') {
    return parseRunnerConfigStorageContext({
      RUNNER_CONFIG_STORAGE_PROVIDER: provider,
      RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME: environment[DYNAMODB_TABLE_ENVIRONMENT_VARIABLE],
    });
  }
  throw new Error('runner configuration storage provider is unsupported');
}

/** Revalidates a payload context and returns its exact environment-variable map. */
export function runnerConfigStorageEnvironment(context: RunnerConfigStorageContext): RunnerConfigStorageEnvironment {
  return parseRunnerConfigStorageContext(context);
}

/**
 * Exports only allowlisted storage variables. Provider locators from a previous
 * run are cleared so they cannot influence the selected consumer.
 */
export function exportRunnerConfigStorageEnvironment(
  context: RunnerConfigStorageContext,
  target: MutableEnvironment = process.env,
): RunnerConfigStorageEnvironment {
  const environment = runnerConfigStorageEnvironment(context);
  for (const name of STORAGE_ENVIRONMENT_VARIABLES) {
    delete target[name];
  }
  for (const [name, value] of Object.entries(environment)) {
    target[name] = value;
  }
  return environment;
}

export function createRunnerConfigConsumerFromEnvironment(
  environment: Environment = process.env,
  config?: RunnerConfigConsumerConfig,
): RunnerConfigConsumer {
  const storage = loadRunnerConfigStorageContextFromEnvironment(environment);
  const resolvedConfig = config ?? loadRunnerConfigConsumerConfigFromEnvironment(environment);
  switch (storage.RUNNER_CONFIG_STORAGE_PROVIDER) {
    case 'aws_ssm':
      return createAwsSsmRunnerConfigConsumer(storage, {
        api: resolvedConfig.awsSsmApi,
        callTimeoutMs: resolvedConfig.callTimeoutMs,
        configTimeoutMs: resolvedConfig.configTimeoutMs,
        deleteAttempts: resolvedConfig.deleteAttempts,
        pollIntervalMs: resolvedConfig.pollIntervalMs,
      });
    case 'aws_dynamodb':
      return createAwsDynamoDbRunnerConfigConsumer(storage, {
        api: resolvedConfig.awsDynamoDbApi,
        callTimeoutMs: resolvedConfig.callTimeoutMs,
        configTimeoutMs: resolvedConfig.configTimeoutMs,
        pollIntervalMs: resolvedConfig.pollIntervalMs,
      });
  }
}

export function loadRunnerConfigConsumerConfigFromEnvironment(
  environment: Environment = process.env,
): RunnerConfigConsumerConfig {
  return {
    callTimeoutMs: secondsEnvironmentValue(environment, 'AWS_SDK_CALL_TIMEOUT_SECONDS', 5) * 1_000,
    configTimeoutMs: secondsEnvironmentValue(environment, 'RUNNER_CONFIG_TIMEOUT_SECONDS', 20) * 1_000,
    deleteAttempts: positiveIntegerEnvironmentValue(environment, 'RUNNER_CONFIG_DELETE_ATTEMPTS', 3, 10),
    pollIntervalMs: secondsEnvironmentValue(environment, 'RUNNER_CONFIG_POLL_SECONDS', 2) * 1_000,
  };
}

function secondsEnvironmentValue(environment: Environment, name: string, fallback: number): number {
  return positiveIntegerEnvironmentValue(environment, name, fallback, 60);
}

function positiveIntegerEnvironmentValue(
  environment: Environment,
  name: string,
  fallback: number,
  maximum: number,
): number {
  const value = environment[name];
  if (value === undefined || !/^\d+$/.test(value)) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}

function isPlainObject(value: unknown): value is Record<PropertyKey, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length && keys.every((key) => typeof key === 'string' && expected.includes(key));
}
