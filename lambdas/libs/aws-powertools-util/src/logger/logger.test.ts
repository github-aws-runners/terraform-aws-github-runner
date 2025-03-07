import { Context } from 'aws-lambda';

import { logger, setContext } from '../';
import { describe, test, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetAllMocks();
});

const context: Context = {
  awsRequestId: '1',
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'unit-test',
  functionVersion: '',
  getRemainingTimeInMillis: () => 0,
  invokedFunctionArn: '',
  logGroupName: '',
  logStreamName: '',
  memoryLimitInMB: '',
  done: () => {
    return;
  },
  fail: () => {
    return;
  },
  succeed: () => {
    return;
  },
};

describe('A root logger.', () => {
  test('Should log set context.', async () => {
    setContext(context, 'unit-test');

    expect(logger.getPersistentLogAttributes()).toEqual(
      expect.objectContaining({
        'aws-request-id': context.awsRequestId,
        'function-name': context.functionName,
        module: 'unit-test',
      }),
    );
  });
});
