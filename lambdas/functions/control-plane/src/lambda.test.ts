import { captureLambdaHandler, logger } from '@aws-github-runner/aws-powertools-util';
import { Context, SQSEvent, SQSRecord } from 'aws-lambda';

import { addMiddleware, adjustPool, scaleDownHandler, scaleUpHandler, ssmHousekeeper, jobRetryCheck } from './lambda';
import { adjust } from './pool/pool';
import ScaleError from './scale-runners/ScaleError';
import { scaleDown } from './scale-runners/scale-down';
import { ActionRequestMessage, scaleUp } from './scale-runners/scale-up';
import { cleanSSMTokens } from './scale-runners/ssm-housekeeper';
import { checkAndRetryJob } from './scale-runners/job-retry';
import { describe, it, expect, vi, MockedFunction, beforeEach } from 'vitest';

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
  eventSource: 'aws:sqs',
  eventSourceARN: '',
  md5OfBody: '',
  messageAttributes: {},
  messageId: 'abcd1234',
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
  it('Do not handle empty record sets.', async () => {
    const sqsEventMultipleRecords: SQSEvent = {
      Records: [],
    };

    await expect(scaleUpHandler(sqsEventMultipleRecords, context)).resolves.not.toThrow();
  });

  it('Ignores non-sqs event sources.', async () => {
    const record = {
      ...sqsRecord,
      eventSource: 'aws:non-sqs',
    };

    const sqsEventMultipleRecordsNonSQS: SQSEvent = {
      Records: [record],
    };

    await expect(scaleUpHandler(sqsEventMultipleRecordsNonSQS, context)).resolves.not.toThrow();
    expect(scaleUp).toHaveBeenCalledWith([]);
  });

  it('Scale without error should resolve.', async () => {
    vi.mocked(scaleUp).mockResolvedValue([]);
    await expect(scaleUpHandler(sqsEvent, context)).resolves.not.toThrow();
  });

  it('Non scale should resolve.', async () => {
    const error = new Error('Non scale should resolve.');
    vi.mocked(scaleUp).mockRejectedValue(error);
    await expect(scaleUpHandler(sqsEvent, context)).resolves.not.toThrow();
  });

  it('Scale should create a batch failure message', async () => {
    const error = new ScaleError();
    vi.mocked(scaleUp).mockRejectedValue(error);
    await expect(scaleUpHandler(sqsEvent, context)).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: sqsRecord.messageId }],
    });
  });

  describe('Batch processing', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    const createMultipleRecords = (count: number, eventSource = 'aws:sqs'): SQSRecord[] => {
      return Array.from({ length: count }, (_, i) => ({
        ...sqsRecord,
        eventSource,
        messageId: `message-${i}`,
        body: JSON.stringify({
          ...body,
          id: i + 1,
        }),
      }));
    };

    it('Should handle multiple SQS records in a single invocation', async () => {
      const records = createMultipleRecords(3);
      const multiRecordEvent: SQSEvent = { Records: records };

      vi.mocked(scaleUp).mockResolvedValue([]);

      await expect(scaleUpHandler(multiRecordEvent, context)).resolves.not.toThrow();
      expect(scaleUp).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ messageId: 'message-0' }),
          expect.objectContaining({ messageId: 'message-1' }),
          expect.objectContaining({ messageId: 'message-2' }),
        ]),
      );
    });

    it('Should return batch item failures for rejected messages', async () => {
      const records = createMultipleRecords(3);
      const multiRecordEvent: SQSEvent = { Records: records };

      vi.mocked(scaleUp).mockResolvedValue(['message-1', 'message-2']);

      const result = await scaleUpHandler(multiRecordEvent, context);
      expect(result).toEqual({
        batchItemFailures: [{ itemIdentifier: 'message-1' }, { itemIdentifier: 'message-2' }],
      });
    });

    it('Should filter out non-SQS event sources', async () => {
      const sqsRecords = createMultipleRecords(2, 'aws:sqs');
      const nonSqsRecords = createMultipleRecords(1, 'aws:sns');
      const mixedEvent: SQSEvent = {
        Records: [...sqsRecords, ...nonSqsRecords],
      };

      vi.mocked(scaleUp).mockResolvedValue([]);

      await scaleUpHandler(mixedEvent, context);
      expect(scaleUp).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ messageId: 'message-0' }),
          expect.objectContaining({ messageId: 'message-1' }),
        ]),
      );
      expect(scaleUp).not.toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ messageId: 'message-2' })]),
      );
    });

    it('Should sort messages by retry count', async () => {
      const records = [
        {
          ...sqsRecord,
          messageId: 'high-retry',
          body: JSON.stringify({ ...body, retryCounter: 5 }),
        },
        {
          ...sqsRecord,
          messageId: 'low-retry',
          body: JSON.stringify({ ...body, retryCounter: 1 }),
        },
        {
          ...sqsRecord,
          messageId: 'no-retry',
          body: JSON.stringify({ ...body }),
        },
      ];
      const multiRecordEvent: SQSEvent = { Records: records };

      vi.mocked(scaleUp).mockImplementation((messages) => {
        // Verify messages are sorted by retry count (ascending)
        expect(messages[0].messageId).toBe('no-retry');
        expect(messages[1].messageId).toBe('low-retry');
        expect(messages[2].messageId).toBe('high-retry');
        return Promise.resolve([]);
      });

      await scaleUpHandler(multiRecordEvent, context);
    });

    it('Should return all failed messages when scaleUp throws non-ScaleError', async () => {
      const records = createMultipleRecords(2);
      const multiRecordEvent: SQSEvent = { Records: records };

      vi.mocked(scaleUp).mockRejectedValue(new Error('Generic error'));

      const result = await scaleUpHandler(multiRecordEvent, context);
      expect(result).toEqual({ batchItemFailures: [] });
    });

    it('Should throw when scaleUp throws ScaleError', async () => {
      const records = createMultipleRecords(2);
      const multiRecordEvent: SQSEvent = { Records: records };

      const error = new ScaleError(2);
      vi.mocked(scaleUp).mockRejectedValue(error);

      await expect(scaleUpHandler(multiRecordEvent, context)).resolves.toEqual({
        batchItemFailures: [{ itemIdentifier: 'message-0' }, { itemIdentifier: 'message-1' }],
      });
    });
  });
});

describe('Test scale down lambda wrapper.', () => {
  it('Scaling down no error.', async () => {
    vi.mocked(scaleDown).mockResolvedValue();
    await expect(scaleDownHandler({}, context)).resolves.not.toThrow();
  });

  it('Scaling down with error.', async () => {
    const error = new Error('Scaling down with error.');
    vi.mocked(scaleDown).mockRejectedValue(error);
    await expect(scaleDownHandler({}, context)).resolves.not.toThrow();
  });
});

describe('Adjust pool.', () => {
  it('Receive message to adjust pool.', async () => {
    vi.mocked(adjust).mockResolvedValue();
    await expect(adjustPool({ poolSize: 2 }, context)).resolves.not.toThrow();
  });

  it('Handle error for adjusting pool.', async () => {
    const error = new Error('Handle error for adjusting pool.');
    vi.mocked(adjust).mockRejectedValue(error);
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
    vi.mocked(cleanSSMTokens).mockResolvedValue();

    process.env.SSM_CLEANUP_CONFIG = JSON.stringify({
      dryRun: false,
      minimumDaysOld: 1,
      tokenPath: '/path/to/tokens/',
    });

    await expect(ssmHousekeeper({}, context)).resolves.not.toThrow();
  });

  it('Errors not throws.', async () => {
    vi.mocked(cleanSSMTokens).mockRejectedValue(new Error());
    await expect(ssmHousekeeper({}, context)).resolves.not.toThrow();
  });
});

describe('Test job retry check wrapper', () => {
  it('Handle without error should resolve.', async () => {
    vi.mocked(checkAndRetryJob).mockResolvedValue();
    await expect(jobRetryCheck(sqsEvent, context)).resolves.not.toThrow();
  });

  it('Handle with error should resolve and log only a warning.', async () => {
    const error = new Error('Error handling retry check.');
    vi.mocked(checkAndRetryJob).mockRejectedValue(error);

    const logSpyWarn = vi.spyOn(logger, 'warn');
    await expect(jobRetryCheck(sqsEvent, context)).resolves.not.toThrow();
    expect(logSpyWarn).toHaveBeenCalledWith(`Error processing job retry: ${error.message}`, { error });
  });
});
