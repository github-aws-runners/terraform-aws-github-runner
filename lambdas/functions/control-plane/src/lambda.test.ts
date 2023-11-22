import { captureLambdaHandler, logger } from '@terraform-aws-github-runner/aws-powertools-util';
import { Context, SQSEvent, SQSRecord } from 'aws-lambda';
import { mocked } from 'jest-mock';

import { addMiddleware, adjustPool, scaleDownHandler, scaleUpHandler, ssmHousekeeper } from './lambda';
import { adjust } from './pool/pool';
import ScaleError from './scale-runners/ScaleError';
import { scaleDown } from './scale-runners/scale-down';
import { ActionRequestMessage, scaleUp } from './scale-runners/scale-up';
import { cleanSSMTokens } from './scale-runners/ssm-housekeeper';

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
jest.mock('./scale-runners/ssm-housekeeper');
jest.mock('@terraform-aws-github-runner/aws-powertools-util');

// Docs for testing async with jest: https://jestjs.io/docs/tutorial-async
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
    const error = new Error('Non scale should resolve.');
    const mock = mocked(scaleUp);
    mock.mockRejectedValue(error);
    await expect(scaleUpHandler(sqsEvent, context)).resolves.not.toThrow;
  });

  it('Scale should be rejected', async () => {
    const error = new ScaleError('Scale should be rejected');
    const mock = mocked(scaleUp);
    mock.mockRejectedValue(error);
    await expect(scaleUpHandler(sqsEvent, context)).rejects.toThrow(error);
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

  await expect(scaleUpHandler(sqsEventMultipleRecords, context)).resolves.not.toThrow();

  expect(logWarnSpy).toHaveBeenCalledWith(
    expect.stringContaining(
      'Event ignored, only one record at the time can be handled, ensure the lambda batch size is set to 1.',
    ),
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
    await expect(scaleDownHandler({}, context)).resolves.not.toThrow();
  });

  it('Scaling down with error.', async () => {
    const error = new Error('Scaling down with error.');
    const mock = mocked(scaleDown);
    mock.mockRejectedValue(error);
    await expect(scaleDownHandler({}, context)).resolves.not.toThrow();
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
    await expect(adjustPool({ poolSize: 2 }, context)).resolves.not.toThrow();
  });

  it('Handle error for adjusting pool.', async () => {
    const mock = mocked(adjust);
    const error = new Error('Handle error for adjusting pool.');
    mock.mockRejectedValue(error);
    const logSpy = jest.spyOn(logger, 'error');
    await adjustPool({ poolSize: 0 }, context);
    expect(logSpy).lastCalledWith(expect.stringContaining(error.message), expect.anything());
  });
});

describe('Test middleware', () => {
  it('Should have a working middleware', async () => {
    const mockedLambdaHandler = captureLambdaHandler as unknown as jest.Mock;
    mockedLambdaHandler.mockReturnValue({ before: jest.fn(), after: jest.fn(), onError: jest.fn() });
    expect(addMiddleware).not.toThrowError();
  });
});

describe('Test ssm housekeeper lambda wrapper.', () => {
  it('Invoke without errors.', async () => {
    const mock = mocked(cleanSSMTokens);
    mock.mockImplementation(() => {
      return new Promise((resolve) => {
        resolve();
      });
    });

    process.env.SSM_CLEANUP_CONFIG = JSON.stringify({
      dryRun: false,
      minimumDaysOld: 1,
      tokenPath: '/path/to/tokens/',
    });

    await expect(ssmHousekeeper({}, context)).resolves.not.toThrow();
  });

  it('Errors not throwed.', async () => {
    const mock = mocked(cleanSSMTokens);
    mock.mockRejectedValue(new Error());
    await expect(ssmHousekeeper({}, context)).resolves.not.toThrow();
  });
});
