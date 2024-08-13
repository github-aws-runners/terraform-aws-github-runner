import { publishMessage } from '../aws/sqs';
import { publishRetryMessage, checkAndRetryJob } from './job-retry';
import { ActionRequestMessage } from './scale-up';
import { getOctokit } from '../gh-auth/gh-octokit';
import { Octokit } from '@octokit/rest';
import { mocked } from 'jest-mock';
jest.mock('../aws/sqs');

const cleanEnv = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...cleanEnv };
});

const mockOctokit = {
  actions: {
    getJobForWorkflowRun: jest.fn(),
  },
};

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => mockOctokit),
}));
jest.mock('../gh-auth/gh-octokit');

const mockCreateOctokitClient = mocked(getOctokit, { shallow: false });
mockCreateOctokitClient.mockResolvedValue(new (Octokit as jest.MockedClass<typeof Octokit>)());

describe('Test job retry publish message', () => {
  const data = [
    {
      description: 'publish a message if retry is enabled and counter is undefined.',
      input: { enable: true, retryCounter: undefined },
      output: { published: true, maxAttempts: 2, newRetryCounter: 0, delay: 10 },
    },
    {
      description: 'publish a message if retry is enabled and counter is 1 and is below max attempts.',
      input: { enable: true, retryCounter: 0 },
      output: { published: true, maxAttempts: 2, newRetryCounter: 1, delay: 20 },
    },
    {
      description: 'NOT publish a message if retry is enabled and counter is 1 and is NOT below max attempts.',
      input: { enable: true, retryCounter: 0 },
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
      repositoryOwner: 'philips-labs',
      repoOwnerType: 'Organization',
      retryCounter: input.retryCounter,
    };
    const jobRetryConfig = {
      enable: input.enable,
      maxAttempts: output.maxAttempts,
      delayInSeconds: 10,
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
      repositoryOwner: 'philips-labs',
      repoOwnerType: 'Organization'
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

    const message: ActionRequestMessage = {
      eventType: 'workflow_job',
      id: 0,
      installationId: 0,
      repositoryName: 'test',
      repositoryOwner: 'philips-labs',
      repoOwnerType: 'Organization'
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
  });

  it(`should publish a message for retry if retry is enabled and counter is below max attempts v2.`, async () => {
    // setup
    mockOctokit.actions.getJobForWorkflowRun.mockImplementation(() => ({
      data: {
        status: 'running',
      },
    }));

    const message: ActionRequestMessage = {
      eventType: 'workflow_job',
      id: 0,
      installationId: 0,
      repositoryName: 'test',
      repositoryOwner: 'philips-labs',
      repoOwnerType: 'Organization'
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

    const message: ActionRequestMessage = {
      eventType: 'workflow_job',
      id: 0,
      installationId: 0,
      repositoryName: 'test',
      repositoryOwner: 'philips-labs',
      repoOwnerType: 'Organization'
    };
    process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';

    // act
    await checkAndRetryJob(message);

    // assert
    expect(publishMessage).not.toHaveBeenCalled();
  });
});
