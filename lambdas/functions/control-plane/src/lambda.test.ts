import { captureLambdaHandler, logger } from '@aws-github-runner/aws-powertools-util';
import { Context, SQSEvent, SQSRecord } from 'aws-lambda';

import { addMiddleware, adjustPool, scaleDownHandler, scaleUpHandler, ssmHousekeeper, jobRetryCheck } from './lambda';
import { adjust } from './pool/pool';
import ScaleError from './scale-runners/ScaleError';
import { scaleDown } from './scale-runners/scale-down';
import { ActionRequestMessage, scaleUp } from './scale-runners/scale-up';
import { cleanSSMTokens } from './scale-runners/ssm-housekeeper';
import { checkAndRetryJob } from './scale-runners/job-retry';
import { describe, it, expect, vi, MockedFunction } from 'vitest';

const body: ActionRequestMessage = {
  eventType: 'workflow_job',
  id: 1,
  installationId: 1,
  repositoryName: 'name',
  repositoryOwner: 'owner',
  repoOwnerType: 'Organization',
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

vi.mock('./pool/pool');
vi.mock('./scale-runners/scale-down');
vi.mock('./scale-runners/scale-up');
vi.mock('./scale-runners/ssm-housekeeper');
vi.mock('./scale-runners/job-retry');
vi.mock('@aws-github-runner/aws-powertools-util');
vi.mock('@aws-github-runner/aws-ssm-util');

describe('Test scale up lambda wrapper.', () => {
  it('Do not handle multiple record sets.', async () => {
    await testInvalidRecords([sqsRecord, sqsRecord]);
  });

  it('Do not handle empty record sets.', async () => {
    await testInvalidRecords([]);
  });

  it('Scale without error should resolve.', async () => {
    const mock = vi.fn(scaleUp);
    mock.mockImplementation(() => {
      return new Promise((resolve) => {
        resolve();
      });
    });
    await expect(scaleUpHandler(sqsEvent, context)).resolves.not.toThrow();
  });

  it('Non scale should resolve.', async () => {
    const error = new Error('Non scale should resolve.');
    const mock = vi.fn(scaleUp);
    mock.mockRejectedValue(error);
    await expect(scaleUpHandler(sqsEvent, context)).resolves.not.toThrow();
  });

  it('Scale should be rejected', async () => {
    const error = new ScaleError('Scale should be rejected');
    const mock = vi.fn() as MockedFunction<typeof scaleUp>;
    mock.mockImplementation(() => {
      return Promise.reject(error);
    });
    vi.mocked(scaleUp).mockImplementation(mock);
    await expect(scaleUpHandler(sqsEvent, context)).rejects.toThrow(error);
  });
});

async function testInvalidRecords(sqsRecords: SQSRecord[]) {
  const mock = vi.fn(scaleUp);
  const logWarnSpy = vi.spyOn(logger, 'warn');
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
    const mock = vi.fn(scaleDown);
    mock.mockImplementation(() => {
      return new Promise((resolve) => {
        resolve();
      });
    });
    await expect(scaleDownHandler({}, context)).resolves.not.toThrow();
  });

  it('Scaling down with error.', async () => {
    const error = new Error('Scaling down with error.');
    const mock = vi.fn(scaleDown);
    mock.mockRejectedValue(error);
    await expect(scaleDownHandler({}, context)).resolves.not.toThrow();
  });
});

describe('Adjust pool.', () => {
  it('Receive message to adjust pool.', async () => {
    const mock = vi.fn(adjust);
    mock.mockImplementation(() => {
      return new Promise((resolve) => {
        resolve();
      });
    });
    await expect(adjustPool({ poolSize: 2 }, context)).resolves.not.toThrow();
  });

  it('Handle error for adjusting pool.', async () => {
    const error = new Error('Handle error for adjusting pool.');
    const mock = vi.fn() as MockedFunction<typeof adjust>;
    mock.mockImplementation(() => {
      return Promise.reject(error);
    });
    vi.mocked(adjust).mockImplementation(mock);
    const logSpy = vi.spyOn(logger, 'error');
    await adjustPool({ poolSize: 0 }, context);
    expect(logSpy).toHaveBeenCalledWith(`Handle error for adjusting pool. ${error.message}`, { error });
  });
});

describe('Test middleware', () => {
  it('Should have a working middleware', async () => {
    const mockedLambdaHandler = captureLambdaHandler as MockedFunction<typeof captureLambdaHandler>;
    mockedLambdaHandler.mockReturnValue({ before: vi.fn(), after: vi.fn(), onError: vi.fn() });
    expect(addMiddleware).not.toThrowError();
  });
});

describe('Test ssm housekeeper lambda wrapper.', () => {
  it('Invoke without errors.', async () => {
    const mock = vi.fn(cleanSSMTokens);
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

  it('Errors not throws.', async () => {
    const mock = vi.fn(cleanSSMTokens);
    mock.mockRejectedValue(new Error());
    await expect(ssmHousekeeper({}, context)).resolves.not.toThrow();
  });
});

describe('Test job retry check wrapper', () => {
  it('Handle without error should resolve.', async () => {
    const mock = vi.fn() as MockedFunction<typeof checkAndRetryJob>;
    mock.mockImplementation(() => {
      return Promise.resolve();
    });
    vi.mocked(checkAndRetryJob).mockImplementation(mock);
    await expect(jobRetryCheck(sqsEvent, context)).resolves.not.toThrow();
  });

  it('Handle with error should resolve and log only a warning.', async () => {
    const error = new Error('Error handling retry check.');
    const mock = vi.fn() as MockedFunction<typeof checkAndRetryJob>;
    mock.mockImplementation(() => {
      return Promise.reject(error);
    });
    vi.mocked(checkAndRetryJob).mockImplementation(mock);

    const logSpyWarn = vi.spyOn(logger, 'warn');
    await expect(jobRetryCheck(sqsEvent, context)).resolves.not.toThrow();
    expect(logSpyWarn).toHaveBeenCalledWith(`Error processing job retry: ${error.message}`, { error });
  });
});
