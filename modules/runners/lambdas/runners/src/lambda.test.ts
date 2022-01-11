import { Context, SQSEvent, SQSRecord } from 'aws-lambda';
import { mocked } from 'ts-jest/utils';
import { adjustPool, scaleDownHandler, scaleUpHandler } from './lambda';
import { ActionRequestMessage, scaleUp } from './scale-runners/scale-up';
import ScaleError from './scale-runners/ScaleError';
import { logger } from './logger';
import { scaleDown } from './scale-runners/scale-down';
import { adjust } from './pool/pool';

const body: ActionRequestMessage = {
  eventType: 'workflow_job',
  id: 1,
  installationId: 1,
  repositoryName: 'name',
  repositoryOwner: 'owner',
};

const sqsRecord: SQSRecord = {
  attributes: {
    ApproximateFirstReceiveTimestamp: '',
    ApproximateReceiveCount: '',
    SenderId: '',
    SentTimestamp: '',
  },
  awsRegion: '',
  body: JSON.stringify(body),
  eventSource: 'aws:SQS',
  eventSourceARN: '',
  md5OfBody: '',
  messageAttributes: {},
  messageId: '',
  receiptHandle: '',
};

const sqsEvent: SQSEvent = {
  Records: [sqsRecord],
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

jest.mock('./scale-runners/scale-up');
jest.mock('./scale-runners/scale-down');
jest.mock('./pool/pool');
jest.mock('./logger');

describe('Test scale up lambda wrapper.', () => {
  it('Do not handle multiple record sets.', async () => {
    await testInvalidRecords([sqsRecord, sqsRecord]);
  });

  it('Do not handle empty record sets.', async () => {
    await testInvalidRecords([]);
  });

  it('Scale without error should resolve.', async () => {
    const mock = mocked(scaleUp);
    mock.mockImplementation(() => {
      return new Promise((resolve) => {
        resolve();
      });
    });
    expect(await scaleUpHandler(sqsEvent, context)).resolves;
  });

  it('Non scale should resolve.', async () => {
    const error = new Error('some error');
    const mock = mocked(scaleUp);
    mock.mockRejectedValue(error);
    expect(await scaleUpHandler(sqsEvent, context)).resolves;
  });

  it('Scale should be rejected', async () => {
    const error = new ScaleError('some scale error');
    const mock = mocked(scaleUp);

    mock.mockRejectedValue(error);
    expect(scaleUpHandler(sqsEvent, context)).rejects.toThrow(error);
  });
});

async function testInvalidRecords(sqsRecords: SQSRecord[]) {
  const mock = mocked(scaleUp);
  const logWarnSpy = jest.spyOn(logger, 'warn');
  mock.mockImplementation(() => {
    return new Promise((resolve) => {
      resolve();
    });
  });
  const sqsEventMultipleRecords: SQSEvent = {
    Records: sqsRecords,
  };

  expect(await scaleUpHandler(sqsEventMultipleRecords, context)).resolves;

  expect(logWarnSpy).toHaveBeenCalledWith(
    'Event ignored, only one record at the time can be handled, ensure the lambda batch size is set to 1.',
    undefined,
  );
}

describe('Test scale down lambda wrapper.', () => {
  it('Scaling down no error.', async () => {
    const mock = mocked(scaleDown);
    mock.mockImplementation(() => {
      return new Promise((resolve) => {
        resolve();
      });
    });
    expect(await scaleDownHandler(context)).resolves;
  });

  it('Scaling down with error.', async () => {
    const error = new Error('some error');
    const mock = mocked(scaleDown);
    mock.mockRejectedValue(error);
    expect(await scaleDownHandler(context)).resolves;
  });
});

describe('Adjust pool.', () => {
  it('Receive message to adjust pool.', async () => {
    const mock = mocked(adjust);
    mock.mockImplementation(() => {
      return new Promise((resolve) => {
        resolve();
      });
    });
    expect(await adjustPool({ poolSize: 2 }, context)).resolves;
  });

  it('Handle error for adjusting pool.', async () => {
    const mock = mocked(adjust);
    const error = new Error('errorXYX');
    mock.mockRejectedValue(error);
    const logSpy = jest.spyOn(logger, 'error');
    expect(await adjustPool({ poolSize: 0 }, context)).resolves;
    expect(logSpy).lastCalledWith(error);
  });
});
