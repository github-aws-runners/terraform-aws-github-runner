import { mocked } from 'ts-jest/utils';
import { ActionRequestMessage, scaleUp } from './scale-up';

import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { listRunners, createRunner } from './runners';

jest.mock('@octokit/auth-app', () => ({
  createAppAuth: jest.fn().mockImplementation(() => jest.fn().mockImplementation(() => ({ token: 'Blaat' }))),
}));
const mockOctokit = {
  checks: { get: jest.fn() },
  actions: {
    listWorkflowRunsForRepo: jest.fn(),
    createRegistrationTokenForOrg: jest.fn(),
    createRegistrationTokenForRepo: jest.fn(),
  },
};
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => mockOctokit),
}));

jest.mock('./runners');

const TEST_DATA: ActionRequestMessage = {
  id: 1,
  eventType: 'check_run',
  repositoryName: 'hello-world',
  repositoryOwner: 'Codertocat',
  installationId: 2,
};

describe('scaleUp', () => {
  beforeEach(() => {
    process.env.GITHUB_APP_KEY_BASE64 = 'TEST_CERTIFICATE_DATA';
    process.env.GITHUB_APP_ID = '1337';
    process.env.GITHUB_APP_CLIENT_ID = 'TEST_CLIENT_ID';
    process.env.GITHUB_APP_CLIENT_SECRET = 'TEST_CLIENT_SECRET';
    process.env.RUNNERS_MAXIMUM_COUNT = '3';
    process.env.ENVIRONMENT = 'unit-test-environment';

    jest.clearAllMocks();
    mockOctokit.actions.listWorkflowRunsForRepo.mockImplementation(() => ({
      data: {
        total_count: 1,
      },
    }));
    const mockTokenReturnValue = {
      data: {
        token: '1234abcd',
      },
    };
    mockOctokit.actions.createRegistrationTokenForOrg.mockImplementation(() => mockTokenReturnValue);
    mockOctokit.actions.createRegistrationTokenForRepo.mockImplementation(() => mockTokenReturnValue);
    const mockListRunners = mocked(listRunners);
    mockListRunners.mockImplementation(async () => [
      {
        instanceId: 'i-1234',
        launchTime: new Date(),
        repo: `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
        org: TEST_DATA.repositoryOwner,
      },
    ]);
  });

  it('ignores non-sqs events', async () => {
    expect.assertions(1);
    expect(scaleUp('aws:s3', TEST_DATA)).rejects.toEqual(Error('Cannot handle non-SQS events!'));
  });

  it('checks queued workflows', async () => {
    await scaleUp('aws:sqs', TEST_DATA);
    expect(mockOctokit.actions.listWorkflowRunsForRepo).toBeCalledWith({
      owner: TEST_DATA.repositoryOwner,
      repo: TEST_DATA.repositoryName,
      status: 'queued',
    });
  });

  it('does not list runners when no workflows are queued', async () => {
    mockOctokit.actions.listWorkflowRunsForRepo.mockImplementation(() => ({
      data: { total_count: 0, runners: [] },
    }));
    await scaleUp('aws:sqs', TEST_DATA);
    expect(listRunners).not.toBeCalled();
  });

  describe('on org level', () => {
    beforeAll(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
    });

    it('gets the current org level runners', async () => {
      await scaleUp('aws:sqs', TEST_DATA);
      expect(listRunners).toBeCalledWith({
        environment: 'unit-test-environment',
        repoName: undefined,
      });
    });

    it('does not create a token when maximum runners has been reached', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1';
      await scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).not.toBeCalled();
    });

    it('creates a token when maximum runners has not been reached', async () => {
      await scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).toBeCalled();
      expect(mockOctokit.actions.createRegistrationTokenForOrg).toBeCalledWith({
        org: TEST_DATA.repositoryOwner,
      });
    });

    it('creates a runner with correct config', async () => {
      await scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerConfig: `--url https://github.com/${TEST_DATA.repositoryOwner} --token 1234abcd `,
        orgName: TEST_DATA.repositoryOwner,
        repoName: undefined,
      });
    });
  });

  describe('on repo level', () => {
    beforeAll(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
    });

    it('gets the current repo level runners', async () => {
      await scaleUp('aws:sqs', TEST_DATA);
      expect(listRunners).toBeCalledWith({
        environment: 'unit-test-environment',
        repoName: `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
      });
    });

    it('does not create a token when maximum runners has been reached', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1';
      await scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForRepo).not.toBeCalled();
    });

    it('creates a token when maximum runners has not been reached', async () => {
      await scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForRepo).toBeCalledWith({
        owner: TEST_DATA.repositoryOwner,
        repo: TEST_DATA.repositoryName,
      });
    });

    it('creates a runner with correct config and labels', async () => {
      process.env.RUNNER_EXTRA_LABELS = 'label1,label2';
      await scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerConfig: `--url https://github.com/${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName} --token 1234abcd --labels label1,label2`,
        orgName: undefined,
        repoName: `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
      });
    });
  });
});
