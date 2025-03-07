import { Context } from 'aws-lambda';

import { addPersistentContextToChildLogger, createChildLogger, logger, setContext } from '.';
import { describe, test, expect } from 'vitest';

const childLogger = createChildLogger('child');
addPersistentContextToChildLogger({ child: 'child' });

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

describe('A child logger.', () => {
  test('should log inherit context from root and combined with own context.', () => {
    expect(childLogger).not.toBe(logger);
    setContext(context, 'unit-test');

    expect(logger.getPersistentLogAttributes()).toEqual(
      expect.objectContaining({
        'aws-request-id': context.awsRequestId,
        'function-name': context.functionName,
        module: 'unit-test',
      }),
    );

    expect(childLogger.getPersistentLogAttributes()).toEqual(
      expect.objectContaining({
        module: 'child',
        'aws-request-id': context.awsRequestId,
        'function-name': context.functionName,
      }),
    );
  });
});
