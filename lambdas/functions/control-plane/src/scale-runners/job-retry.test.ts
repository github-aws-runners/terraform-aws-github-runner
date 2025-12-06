import { publishMessage } from '../aws/sqs';
import { publishRetryMessage, checkAndRetryJob } from './job-retry';
import { ActionRequestMessage, ActionRequestMessageRetry } from './scale-up';
import { getOctokit } from '../github/octokit';
import { jobRetryCheck } from '../lambda';
import { Octokit } from '@octokit/rest';
import { createSingleMetric } from '@aws-github-runner/aws-powertools-util';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SQSRecord } from 'aws-lambda';

vi.mock('../aws/sqs', async () => ({
  publishMessage: vi.fn(),
}));

vi.mock('@aws-github-runner/aws-powertools-util', async () => {
  // This is a workaround for TypeScript's type checking
  // Use vi.importActual with a type assertion to avoid spread operator type error
  const actual = (await vi.importActual(
    '@aws-github-runner/aws-powertools-util',
  )) as typeof import('@aws-github-runner/aws-powertools-util');

  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    createSingleMetric: vi.fn((name: string, unit: string, value: number, dimensions?: Record<string, string>) => {
      return {
        addMetadata: vi.fn(),
      };
    }),
  };
});

const cleanEnv = process.env;

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...cleanEnv };
});

const mockOctokit = {
  actions: {
    getJobForWorkflowRun: vi.fn(),
  },
};

vi.mock('@octokit/rest', async () => ({
  Octokit: vi.fn().mockImplementation(function () {
    return mockOctokit;
  }),
}));
vi.mock('../github/octokit', async () => ({
  getOctokit: vi.fn(),
}));

const mockCreateOctokitClient = vi.mocked(getOctokit);
mockCreateOctokitClient.mockResolvedValue(new Octokit());

describe('Test job retry publish message', () => {
  const data = [
    {
      description: 'publish a message if retry is enabled and counter is undefined.',
      input: { enable: true, retryCounter: undefined, maxAttempts: 2, delayInSeconds: 10 },
      output: { published: true, newRetryCounter: 0, delay: 10 },
    },
    {
      description: 'publish a message if retry is enabled and counter is 1 and is below max attempts.',
      input: { enable: true, retryCounter: 0, maxAttempts: 2, delayInSeconds: 10 },
      output: { published: true, newRetryCounter: 1, delay: 20 },
    },
    {
      description: 'publish a message with delay exceeding sqs max.',
      input: { enable: true, retryCounter: 0, maxAttempts: 2, delayInSeconds: 1000 },
      output: { published: true, newRetryCounter: 1, delay: 900 },
    },
    {
      description: 'NOT publish a message if retry is enabled and counter is 1 and is NOT below max attempts.',
      input: { enable: true, retryCounter: 0, delayInSeconds: 1000 },
      output: { published: false },
    },
    {
      description: 'NOT publish a message if retry is NOT enabled.',
      input: { enable: false },
      output: { published: false },
    },
  ];

  it.each(data)(`should $description`, async ({ input, output }) => {
    const message: ActionRequestMessage = {
      eventType: 'workflow_job',
      id: 0,
      installationId: 0,
      repositoryName: 'test',
      repositoryOwner: 'github-aws-runners',
      repoOwnerType: 'Organization',
      retryCounter: input.retryCounter,
    };
    const jobRetryConfig = {
      enable: input.enable,
      maxAttempts: input.maxAttempts,
      delayInSeconds: input.delayInSeconds,
      delayBackoff: 2,
      queueUrl: 'https://sqs.eu-west-1.amazonaws.com/123456789/webhook_events_workflow_job_queue',
    };
    process.env.JOB_RETRY_CONFIG = JSON.stringify(jobRetryConfig);

    // act
    await publishRetryMessage(message);

    // assert
    if (output.published) {
      expect(publishMessage).toHaveBeenCalledWith(
        JSON.stringify({
          ...message,
          retryCounter: output.newRetryCounter,
        }),
        jobRetryConfig.queueUrl,
        output.delay,
      );
    } else {
      expect(publishMessage).not.toHaveBeenCalled();
    }
  });

  it(`should not ignore and not throw if no retry configuration is set. `, async () => {
    // setup
    const message: ActionRequestMessage = {
      eventType: 'workflow_job',
      id: 0,
      installationId: 0,
      repositoryName: 'test',
      repositoryOwner: 'github-aws-runners',
      repoOwnerType: 'Organization',
    };

    // act
    await expect(publishRetryMessage(message)).resolves.not.toThrow();
    expect(publishMessage).not.toHaveBeenCalled();
  });
});

describe(`Test job retry check`, () => {
  it(`should publish a message for retry if retry is enabled and counter is below max attempts.`, async () => {
    // setup
    mockOctokit.actions.getJobForWorkflowRun.mockImplementation(() => ({
      data: {
        status: 'queued',
      },
    }));

    const message: ActionRequestMessageRetry = {
      eventType: 'workflow_job',
      id: 0,
      installationId: 0,
      repositoryName: 'test',
      repositoryOwner: 'github-aws-runners',
      repoOwnerType: 'Organization',
      retryCounter: 0,
    };
    process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
    process.env.RUNNER_NAME_PREFIX = 'test';
    process.env.JOB_QUEUE_SCALE_UP_URL =
      'https://sqs.eu-west-1.amazonaws.com/123456789/webhook_events_workflow_job_queue';

    // act
    await checkAndRetryJob(message);

    // assert
    expect(publishMessage).toHaveBeenCalledWith(
      JSON.stringify({
        ...message,
      }),
      'https://sqs.eu-west-1.amazonaws.com/123456789/webhook_events_workflow_job_queue',
    );
    expect(createSingleMetric).not.toHaveBeenCalled();
  });

  it(`should publish a message for retry if retry is enabled and counter is below max attempts.`, async () => {
    // setup
    mockOctokit.actions.getJobForWorkflowRun.mockImplementation(() => ({
      data: {
        status: 'queued',
      },
    }));

    const message: ActionRequestMessageRetry = {
      eventType: 'workflow_job',
      id: 0,
      installationId: 0,
      repositoryName: 'test',
      repositoryOwner: 'github-aws-runners',
      repoOwnerType: 'Organization',
      retryCounter: 1,
    };

    process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
    process.env.ENVIRONMENT = 'test';
    process.env.RUNNER_NAME_PREFIX = 'test';
    process.env.ENABLE_METRIC_JOB_RETRY = 'true';
    process.env.JOB_QUEUE_SCALE_UP_URL =
      'https://sqs.eu-west-1.amazonaws.com/123456789/webhook_events_workflow_job_queue';

    // act
    await checkAndRetryJob(message);

    // assert
    expect(publishMessage).toHaveBeenCalledWith(
      JSON.stringify({
        ...message,
      }),
      'https://sqs.eu-west-1.amazonaws.com/123456789/webhook_events_workflow_job_queue',
    );
    expect(createSingleMetric).toHaveBeenCalled();
    expect(createSingleMetric).toHaveBeenCalledWith('RetryJob', 'Count', 1, {
      Environment: 'test',
      RetryCount: '1',
    });
  });

  it(`should not publish a message for retry when the job is running.`, async () => {
    // setup
    mockOctokit.actions.getJobForWorkflowRun.mockImplementation(() => ({
      data: {
        status: 'running',
      },
    }));

    const message: ActionRequestMessageRetry = {
      eventType: 'workflow_job',
      id: 0,
      installationId: 0,
      repositoryName: 'test',
      repositoryOwner: 'github-aws-runners',
      repoOwnerType: 'Organization',
      retryCounter: 0,
    };
    process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
    process.env.RUNNER_NAME_PREFIX = 'test';
    process.env.JOB_QUEUE_SCALE_UP_URL =
      'https://sqs.eu-west-1.amazonaws.com/123456789/webhook_events_workflow_job_queue';

    // act
    await checkAndRetryJob(message);

    // assert
    expect(publishMessage).not.toHaveBeenCalled();
  });

  it(`should not publish a message for retry if job is no longer queued.`, async () => {
    // setup
    mockOctokit.actions.getJobForWorkflowRun.mockImplementation(() => ({
      data: {
        status: 'completed',
      },
    }));

    const message: ActionRequestMessageRetry = {
      eventType: 'workflow_job',
      id: 0,
      installationId: 0,
      repositoryName: 'test',
      repositoryOwner: 'github-aws-runners',
      repoOwnerType: 'Organization',
      retryCounter: 0,
    };
    process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';

    // act
    await checkAndRetryJob(message);

    // assert
    expect(publishMessage).not.toHaveBeenCalled();
  });
});

describe('Test job retry handler (batch processing)', () => {
  const context = {
    requestId: 'request-id',
    functionName: 'function-name',
    functionVersion: 'function-version',
    invokedFunctionArn: 'invoked-function-arn',
    memoryLimitInMB: '128',
    awsRequestId: 'aws-request-id',
    logGroupName: 'log-group-name',
    logStreamName: 'log-stream-name',
    remainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
    getRemainingTimeInMillis: () => 30000,
    callbackWaitsForEmptyEventLoop: false,
  };

  function createSQSRecord(messageId: string): SQSRecord {
    return {
      messageId,
      receiptHandle: 'receipt-handle',
      body: JSON.stringify({
        eventType: 'workflow_job',
        id: 123,
        installationId: 456,
        repositoryName: 'test-repo',
        repositoryOwner: 'test-owner',
        repoOwnerType: 'Organization',
        retryCounter: 0,
      }),
      attributes: {
        ApproximateReceiveCount: '1',
        SentTimestamp: '1234567890',
        SenderId: 'sender-id',
        ApproximateFirstReceiveTimestamp: '1234567891',
      },
      messageAttributes: {},
      md5OfBody: 'md5',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:region:account:queue',
      awsRegion: 'us-east-1',
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
    process.env.JOB_QUEUE_SCALE_UP_URL = 'https://sqs.example.com/queue';
  });

  it('should handle multiple records in a single batch', async () => {
    mockOctokit.actions.getJobForWorkflowRun.mockImplementation(() => ({
      data: {
        status: 'queued',
      },
      headers: {},
    }));

    const event = {
      Records: [createSQSRecord('msg-1'), createSQSRecord('msg-2'), createSQSRecord('msg-3')],
    };

    await expect(jobRetryCheck(event, context)).resolves.not.toThrow();
    expect(publishMessage).toHaveBeenCalledTimes(3);
  });

  it('should continue processing other records when one fails', async () => {
    mockCreateOctokitClient
      .mockResolvedValueOnce(new Octokit()) // First record succeeds
      .mockRejectedValueOnce(new Error('API error')) // Second record fails
      .mockResolvedValueOnce(new Octokit()); // Third record succeeds

    mockOctokit.actions.getJobForWorkflowRun.mockImplementation(() => ({
      data: {
        status: 'queued',
      },
      headers: {},
    }));

    const event = {
      Records: [createSQSRecord('msg-1'), createSQSRecord('msg-2'), createSQSRecord('msg-3')],
    };

    await expect(jobRetryCheck(event, context)).resolves.not.toThrow();
    // There were two successful calls to publishMessage
    expect(publishMessage).toHaveBeenCalledTimes(2);
  });
});
