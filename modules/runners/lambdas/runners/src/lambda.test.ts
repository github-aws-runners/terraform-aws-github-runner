import { Context, SQSEvent, SQSRecord } from 'aws-lambda';
import { config } from 'aws-sdk';
import { mocked } from 'jest-mock';

import { adjustPool, configureProxyAwsSdkV2Only, scaleDownHandler, scaleUpHandler } from './lambda';
import { logger } from './logger';
import { adjust } from './pool/pool';
import ScaleError from './scale-runners/ScaleError';
import { scaleDown } from './scale-runners/scale-down';
import { ActionRequestMessage, scaleUp } from './scale-runners/scale-up';

const cleanEnv = process.env;

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

beforeEach(() => {
  process.env = { ...cleanEnv };
});

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
    await expect(scaleUpHandler(sqsEvent, context)).resolves;
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

  await expect(scaleUpHandler(sqsEventMultipleRecords, context)).resolves;

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
    await expect(scaleDownHandler(context)).resolves;
  });

  it('Scaling down with error.', async () => {
    const error = new Error('Scaling down with error.');
    const mock = mocked(scaleDown);
    mock.mockRejectedValue(error);
    await expect(await scaleDownHandler(context)).resolves;
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
    await expect(adjustPool({ poolSize: 2 }, context)).resolves;
  });

  it('Handle error for adjusting pool.', async () => {
    const mock = mocked(adjust);
    const error = new Error('Handle error for adjusting pool.');
    mock.mockRejectedValue(error);
    const logSpy = jest.spyOn(logger, 'error');
    await adjustPool({ poolSize: 0 }, context);
    expect(logSpy).lastCalledWith(error);
  });
});

describe('Test proxy configuration for AWS SDK v2', () => {
  afterEach(() => {
    process.env = { ...cleanEnv };

    // Reset potential agent in AWS config
    delete config.httpOptions?.agent;
  });

  it('Proxy configured', async () => {
    process.env.HTTPS_PROXY = 'http://proxy.company.com';
    configureProxyAwsSdkV2Only();
    const agent = config.httpOptions?.agent;
    expect(agent).toBeDefined();
    expect(JSON.stringify(agent)).toContain(process.env.HTTPS_PROXY);
  });

  it('Proxy not configured', async () => {
    // No 'https_proxy' environment variable should exist, not really testable otherwise
    if (process.env.https_proxy != null) {
      throw new Error('Please remove "https_proxy" environment variable, not testable otherwise');
    }
    configureProxyAwsSdkV2Only();
    expect(config.httpOptions?.agent).toBeUndefined();
  });
});

describe('Test proxy configuration for AWS SDK v2', () => {
  afterEach(() => {
    process.env = { ...cleanEnv };

    // Reset potential agent in AWS config
    delete config.httpOptions?.agent;
  });

  it('Proxy configured', async () => {
    process.env.HTTPS_PROXY = 'http://proxy.company.com';
    configureProxyAwsSdkV2Only();
    const agent = config.httpOptions?.agent;
    expect(agent).toBeDefined();
    expect(JSON.stringify(agent)).toContain(process.env.HTTPS_PROXY);
  });

  it('Proxy not configured', async () => {
    // No 'https_proxy' environment variable should exist, not really testable otherwise
    if (process.env.https_proxy != null) {
      throw new Error('Please remove "https_proxy" environment variable, not testable otherwise');
    }
    configureProxyAwsSdkV2Only();
    expect(config.httpOptions?.agent).toBeUndefined();
  });
});
