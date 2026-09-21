import type { CreateRunnerResult } from '../../../../core';

import type { Ec2RunnerCreateResult, Ec2RunnerFailureCode } from '../runner-create-result';

const RETRYABLE_AWS_ERROR_NAMES = new Set([
  'EC2ThrottledException',
  'InternalError',
  'RequestLimitExceeded',
  'RequestTimeout',
  'RequestTimeoutException',
  'ServiceUnavailable',
  'Throttling',
  'ThrottlingException',
]);

const RETRYABLE_NETWORK_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
]);

function failureCodeValue(failureCode: Ec2RunnerFailureCode, prefix: string): string | undefined {
  return failureCode.startsWith(prefix) ? failureCode.slice(prefix.length) : undefined;
}

function triggersControlPlaneRetry(failureCode: Ec2RunnerFailureCode, configuredErrors: Set<string>): boolean {
  const errorName = failureCodeValue(failureCode, 'aws-name:');
  if (errorName !== undefined) {
    return configuredErrors.has(errorName) || RETRYABLE_AWS_ERROR_NAMES.has(errorName);
  }

  const errorCode = failureCodeValue(failureCode, 'aws-code:');
  if (errorCode !== undefined) return RETRYABLE_NETWORK_ERROR_CODES.has(errorCode);
  if (failureCode === 'aws-fault:server') return true;

  const httpStatus = failureCodeValue(failureCode, 'aws-http:');
  if (httpStatus === undefined) return false;
  const status = Number(httpStatus);
  return status === 429 || status >= 500;
}

export function toControlPlaneCreateRunnerResult(
  result: Ec2RunnerCreateResult,
  configuredRetryableErrors: readonly string[],
): CreateRunnerResult {
  const configuredErrors = new Set(configuredRetryableErrors);
  const retryable = result.failureCodes.some((failureCode) => triggersControlPlaneRetry(failureCode, configuredErrors));
  return {
    instances: result.instances,
    retryableErrorCount: retryable ? result.failedInstanceCount : 0,
    nonRetryableErrorCount: retryable ? 0 : result.failedInstanceCount,
  };
}
