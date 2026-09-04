import { createAwsSsmRunnerConfigConsumer, type AwsSsmRunnerConfigApi } from './aws/ssm/runner-config-consumer';
import type { RunnerConfigConsumer } from './core';
import { canonicalSsmTokenPath, type RunnerConfigPollingOptions } from './runner-config-consumer-common';

export type { RunnerConfigConsumerConfig };
export type { RunnerConfigConsumeOptions, RunnerConfigConsumer } from './core';
export type { AwsSsmRunnerConfigApi } from './aws/ssm/runner-config-consumer';

type Environment = Readonly<Record<string, string | undefined>>;

export interface RunnerConfigConsumerConfig extends RunnerConfigPollingOptions {
  awsSsmApi?: AwsSsmRunnerConfigApi;
  deleteAttempts?: number;
}

export interface RunnerConfigStorageContext {
  RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_ssm';
  SSM_TOKEN_PATH: string;
}

export type RunnerConfigStorageEnvironment = RunnerConfigStorageContext;

/** Creates the consumer from one immutable snapshot of the producer environment. */
export function createRunnerConfigConsumer(
  environment: Environment = process.env,
  config?: RunnerConfigConsumerConfig,
): RunnerConfigConsumer {
  const tokenPath = canonicalSsmTokenPath(requireTokenPath(environment));
  const resolvedConfig = config ?? loadRunnerConfigConsumerConfigFromEnvironment(environment);
  return createAwsSsmRunnerConfigConsumer(
    { SSM_TOKEN_PATH: tokenPath },
    {
      api: resolvedConfig.awsSsmApi,
      callTimeoutMs: resolvedConfig.callTimeoutMs,
      configTimeoutMs: resolvedConfig.configTimeoutMs,
      deleteAttempts: resolvedConfig.deleteAttempts,
      pollIntervalMs: resolvedConfig.pollIntervalMs,
    },
  );
}

/** @deprecated Use createRunnerConfigConsumer. */
export const createRunnerConfigConsumerFromEnvironment = createRunnerConfigConsumer;

export function parseRunnerConfigStorageContext(value: unknown): RunnerConfigStorageContext {
  if (!isPlainObject(value) || value.RUNNER_CONFIG_STORAGE_PROVIDER !== 'aws_ssm') {
    throw new Error('runner configuration storage context is invalid');
  }
  if (
    !hasExactKeys(value, ['RUNNER_CONFIG_STORAGE_PROVIDER', 'SSM_TOKEN_PATH']) ||
    typeof value.SSM_TOKEN_PATH !== 'string'
  ) {
    throw new Error('aws_ssm runner configuration storage context is invalid');
  }
  return Object.freeze({
    RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_ssm',
    SSM_TOKEN_PATH: canonicalSsmTokenPath(value.SSM_TOKEN_PATH),
  });
}

export function loadRunnerConfigStorageContextFromEnvironment(
  environment: Environment = process.env,
): RunnerConfigStorageContext {
  return parseRunnerConfigStorageContext({
    RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_ssm',
    SSM_TOKEN_PATH: environment.SSM_TOKEN_PATH,
  });
}

export function runnerConfigStorageEnvironment(context: RunnerConfigStorageContext): RunnerConfigStorageEnvironment {
  return parseRunnerConfigStorageContext(context);
}

/** Returns an allowlisted environment object without mutating process.env or a caller-owned target. */
export function exportRunnerConfigStorageEnvironment(
  context: RunnerConfigStorageContext,
): RunnerConfigStorageEnvironment {
  return runnerConfigStorageEnvironment(context);
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

function requireTokenPath(environment: Environment): string {
  const tokenPath = environment.SSM_TOKEN_PATH;
  if (!tokenPath || tokenPath.trim() === '') {
    throw new Error('Environment variable SSM_TOKEN_PATH is not set');
  }
  return tokenPath;
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
