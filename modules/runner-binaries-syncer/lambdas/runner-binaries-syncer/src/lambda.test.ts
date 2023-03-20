import { Context } from 'aws-lambda';
import { mocked } from 'jest-mock';

import { handler } from './lambda';
import { sync } from './syncer/syncer';

jest.mock('./syncer/syncer');

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

describe('Test download sync wrapper.', () => {
  it('Test successful download.', async () => {
    const mock = mocked(sync);
    mock.mockImplementation(() => {
      return new Promise((resolve) => {
        resolve();
      });
    });
    await expect(handler({}, context)).resolves;
  });

  it('Test wrapper with returning an error. ', async () => {
    const mock = mocked(sync);
    mock.mockRejectedValue(new Error(''));

    await expect(handler({}, context)).resolves;
  });
});
