import { logger } from '@terraform-aws-github-runner/aws-powertools-util';
import { Context } from 'aws-lambda';
import { mocked } from 'jest-mock';

import { handle as interruptionWarningHandlerImpl } from './termination-warning';
import { interruptionWarning } from './lambda';
import { SpotInterruptionWarning, SpotTerminationDetail } from './types';

jest.mock('./termination-warning');

process.env.POWERTOOLS_METRICS_NAMESPACE = 'test';
process.env.POWERTOOLS_TRACE_ENABLED = 'true';
const event: SpotInterruptionWarning<SpotTerminationDetail> = {
  version: '0',
  id: '1',
  'detail-type': 'EC2 Spot Instance Interruption Warning',
  source: 'aws.ec2',
  account: '123456789012',
  time: '2015-11-11T21:29:54Z',
  region: 'us-east-1',
  resources: ['arn:aws:ec2:us-east-1b:instance/i-abcd1111'],
  detail: {
    'instance-id': 'i-abcd1111',
    'instance-action': 'terminate',
  },
};

const context: Context = {
  awsRequestId: '1',
  callbackWaitsForEmptyEventLoop: false,
  functionName: '',
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

// Docs for testing async with jest: https://jestjs.io/docs/tutorial-async
describe('Handle sport termination interruption warning', () => {
  it('should not throw or log in error.', async () => {
    const mock = mocked(interruptionWarningHandlerImpl);
    mock.mockImplementation(() => {
      return new Promise((resolve) => {
        resolve();
      });
    });
    expect(await interruptionWarning(event, context)).resolves;
  });

  it('should not throw only log in error in case of an exception.', async () => {
    const logSpy = jest.spyOn(logger, 'error');
    const error = new Error('An error.');
    const mock = mocked(interruptionWarningHandlerImpl);
    mock.mockRejectedValue(error);
    await expect(interruptionWarning(event, context)).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});
