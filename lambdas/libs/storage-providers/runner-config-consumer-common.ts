import { Buffer } from 'node:buffer';

import type { RunnerConfigConsumeOptions } from './core';

export const DEFAULT_CALL_TIMEOUT_MS = 5_000;
export const DEFAULT_CONFIG_TIMEOUT_MS = 40_000;
export const DEFAULT_POLL_INTERVAL_MS = 2_000;

const RUNNER_ID_PATTERN = /^[A-Za-z0-9_.-]{1,256}$/;
const SSM_PARAMETER_PATH_PATTERN = /^\/[A-Za-z0-9_.\-/]+$/;
const DYNAMODB_TABLE_NAME_PATTERN = /^[A-Za-z0-9_.-]{3,255}$/;
// AWS counts the partition/region/account ARN prefix toward its 1,011-character
// limit. Leave ample room for that deployment-specific prefix.
const MAX_SSM_PARAMETER_NAME_LENGTH = 900;
const MAX_DYNAMODB_PARTITION_KEY_BYTES = 2_048;
const MAX_DYNAMODB_SORT_KEY_BYTES = 1_024;

const RETRYABLE_ERROR_NAMES = new Set([
  'AbortError',
  'ConnectionError',
  'InternalServerException',
  'ProvisionedThroughputExceededException',
  'RequestLimitExceeded',
  'RequestTimeout',
  'ServiceUnavailable',
  'ThrottlingException',
  'TimeoutError',
]);

export interface RunnerConfigPollingOptions {
  callTimeoutMs?: number;
  configTimeoutMs?: number;
  pollIntervalMs?: number;
}

export interface ResolvedRunnerConfigPollingOptions {
  callTimeoutMs: number;
  configTimeoutMs: number;
  pollIntervalMs: number;
}

class RunnerConfigCallDeadlineError extends Error {
  public constructor() {
    super('runner configuration provider call exceeded its deadline');
    this.name = 'RunnerConfigCallDeadlineError';
  }
}

export function resolvePollingOptions(options: RunnerConfigPollingOptions): ResolvedRunnerConfigPollingOptions {
  return {
    callTimeoutMs: positiveIntegerOption('callTimeoutMs', options.callTimeoutMs, DEFAULT_CALL_TIMEOUT_MS),
    configTimeoutMs: positiveIntegerOption('configTimeoutMs', options.configTimeoutMs, DEFAULT_CONFIG_TIMEOUT_MS),
    pollIntervalMs: positiveIntegerOption('pollIntervalMs', options.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS),
  };
}

export function positiveIntegerOption(name: string, value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export function validateRunnerId(runnerId: string): void {
  if (!RUNNER_ID_PATTERN.test(runnerId)) {
    throw new Error('runnerId is invalid');
  }
}

export function canonicalSsmTokenPath(tokenPath: string): string {
  if (tokenPath.includes('//')) {
    throw new Error('aws_ssm tokenPath is invalid');
  }
  const canonical = tokenPath.endsWith('/') ? tokenPath.slice(0, -1) : tokenPath;
  const segments = canonical.split('/').slice(1);
  if (
    canonical.length === 0 ||
    canonical.length > MAX_SSM_PARAMETER_NAME_LENGTH ||
    !SSM_PARAMETER_PATH_PATTERN.test(canonical) ||
    segments.length > 14 ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..') ||
    /^(aws|ssm)/i.test(segments[0] ?? '')
  ) {
    throw new Error('aws_ssm tokenPath is invalid');
  }
  return canonical;
}

export function composeSsmParameterName(tokenPath: string, runnerId: string): string {
  validateRunnerId(runnerId);
  const parameterName = `${canonicalSsmTokenPath(tokenPath)}/${runnerId}`;
  const segments = parameterName.split('/').slice(1);
  if (parameterName.length > MAX_SSM_PARAMETER_NAME_LENGTH || segments.length > 15) {
    throw new Error('aws_ssm runner configuration key is invalid');
  }
  return parameterName;
}

export function validateDynamoDbTableName(tableName: string): string {
  if (!DYNAMODB_TABLE_NAME_PATTERN.test(tableName)) {
    throw new Error('aws_dynamodb tableName is invalid');
  }
  return tableName;
}

export function validateDynamoDbRunnerConfigKey(scope: string, id: string): void {
  validateRunnerId(scope);
  if (
    Buffer.byteLength(scope, 'utf8') > MAX_DYNAMODB_PARTITION_KEY_BYTES ||
    id.length === 0 ||
    Buffer.byteLength(id, 'utf8') > MAX_DYNAMODB_SORT_KEY_BYTES
  ) {
    throw new Error('aws_dynamodb runner configuration key is invalid');
  }
}

export function validateConsumeOptions(options: RunnerConfigConsumeOptions): void {
  if (!Number.isSafeInteger(options.deadlineMs) || options.deadlineMs <= 0) {
    throw new Error('deadlineMs must be a positive integer');
  }
  if (
    options.signal === null ||
    typeof options.signal !== 'object' ||
    typeof options.signal.aborted !== 'boolean' ||
    typeof options.signal.addEventListener !== 'function' ||
    typeof options.signal.removeEventListener !== 'function'
  ) {
    throw new Error('signal must be an AbortSignal');
  }
}

export function errorName(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'name' in error && typeof error.name === 'string') {
    return error.name;
  }
  return 'UnknownError';
}

function httpStatus(error: unknown): number | undefined {
  if (
    error !== null &&
    typeof error === 'object' &&
    '$metadata' in error &&
    error.$metadata !== null &&
    typeof error.$metadata === 'object' &&
    'httpStatusCode' in error.$metadata &&
    typeof error.$metadata.httpStatusCode === 'number'
  ) {
    return error.$metadata.httpStatusCode;
  }
  return undefined;
}

export function isRetryableProviderError(error: unknown): boolean {
  const status = httpStatus(error);
  return (
    error instanceof RunnerConfigCallDeadlineError ||
    RETRYABLE_ERROR_NAMES.has(errorName(error)) ||
    (status !== undefined && status >= 500)
  );
}

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new Error('runner configuration consumption was cancelled'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => signal.removeEventListener('abort', cancel);
    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const cancel = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      cleanup();
      reject(new Error('runner configuration consumption was cancelled'));
    };
    signal.addEventListener('abort', cancel, { once: true });
  });
}

export async function withCallDeadline<T>(
  parentSignal: AbortSignal,
  deadlineMs: number,
  callTimeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (parentSignal.aborted) {
    throw new Error('runner configuration consumption was cancelled');
  }

  const remaining = deadlineMs - Date.now();
  if (remaining <= 0) {
    throw new RunnerConfigCallDeadlineError();
  }

  const controller = new AbortController();
  let cancel!: () => void;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    cancel = (): void => {
      reject(new Error('runner configuration consumption was cancelled'));
      controller.abort();
    };
    parentSignal.addEventListener('abort', cancel, { once: true });
    timeout = setTimeout(
      () => {
        reject(new RunnerConfigCallDeadlineError());
        controller.abort();
      },
      Math.max(1, Math.min(remaining, callTimeoutMs)),
    );
  });

  try {
    return await Promise.race([operation(controller.signal), deadline]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    parentSignal.removeEventListener('abort', cancel);
  }
}

export function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error('runner configuration consumption was cancelled');
  }
}
