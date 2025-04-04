import { publishMessage } from '../aws/sqs';
import { publishRetryMessage, checkAndRetryJob } from './job-retry';
import { ActionRequestMessage, ActionRequestMessageRetry } from './scale-up';
import { getOctokit } from '../github/octokit';
import { Octokit } from '@octokit/rest';
import { createSingleMetric } from '@aws-github-runner/aws-powertools-util';
import { describe, it, expect, beforeEach, vi } from 'vitest';

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
  Octokit: vi.fn().mockImplementation(() => mockOctokit),
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
