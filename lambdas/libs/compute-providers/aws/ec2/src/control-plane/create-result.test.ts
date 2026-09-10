import { describe, expect, it } from 'vitest';

import type { Ec2RunnerFailureCode } from '../runner-create-result';
import { toControlPlaneCreateRunnerResult } from './create-result';

function result(failureCodes: Ec2RunnerFailureCode[] = []) {
  return {
    instances: [],
    failedInstanceCount: 2,
    failureCodes,
  };
}

describe('control-plane EC2 create result', () => {
  it.each([
    ['configured AWS name', ['aws-name:InsufficientInstanceCapacity'], ['InsufficientInstanceCapacity']],
    ['built-in AWS name', ['aws-name:ThrottlingException'], []],
    ['AWS server fault', ['aws-fault:server'], []],
    ['HTTP throttling status', ['aws-http:429'], []],
    ['HTTP server status', ['aws-http:503'], []],
    ['network code', ['aws-code:ECONNRESET'], []],
  ] as const)('classifies %s as retryable', (_name, failureCodes, configuredErrors) => {
    expect(toControlPlaneCreateRunnerResult(result([...failureCodes]), configuredErrors)).toEqual({
      instances: [],
      retryableErrorCount: 2,
      nonRetryableErrorCount: 0,
    });
  });

  it('classifies missing capacity without retry evidence as non-retryable', () => {
    expect(toControlPlaneCreateRunnerResult(result(['aws-name:InvalidParameterValue']), [])).toEqual({
      instances: [],
      retryableErrorCount: 0,
      nonRetryableErrorCount: 2,
    });
  });

  it('classifies every missing instance as retryable when any Fleet code is retryable', () => {
    expect(
      toControlPlaneCreateRunnerResult(result(['aws-name:InvalidParameterValue', 'aws-name:InternalError']), []),
    ).toEqual({ instances: [], retryableErrorCount: 2, nonRetryableErrorCount: 0 });
  });

  it('preserves created instances while converting failed instances', () => {
    expect(
      toControlPlaneCreateRunnerResult(
        {
          instances: ['i-created'],
          failedInstanceCount: 1,
          failureCodes: ['aws-name:InvalidParameterValue'],
        },
        [],
      ),
    ).toEqual({ instances: ['i-created'], retryableErrorCount: 0, nonRetryableErrorCount: 1 });
  });
});
