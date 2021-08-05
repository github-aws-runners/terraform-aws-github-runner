import { mocked } from 'ts-jest/utils';
import * as scaleUpModule from './scale-up';
import { listRunners, createRunner, RunnerInputParameters } from './runners';
import * as ghAuth from './gh-auth';
import nock from 'nock';
import { Octokit } from '@octokit/rest';

const mockOctokit = {
  checks: { get: jest.fn() },
  actions: {
    createRegistrationTokenForOrg: jest.fn(),
    createRegistrationTokenForRepo: jest.fn(),
    getJobForWorkflowRun: jest.fn(),
  },
  apps: {
    getOrgInstallation: jest.fn(),
    getRepoInstallation: jest.fn(),
  },
};

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => mockOctokit),
}));

jest.mock('./runners');
jest.mock('./gh-auth');

const mocktokit = Octokit as jest.MockedClass<typeof Octokit>;
const mockedAuth = mocked(ghAuth.createGithubAuth, true);
const mockCreateClient = mocked(ghAuth.createOctoClient, true);

const TEST_DATA: scaleUpModule.ActionRequestMessage = {
  id: 1,
  eventType: 'workflow_job',
  repositoryName: 'hello-world',
  repositoryOwner: 'Codertocat',
  installationId: 2,
};

// installationId 0 means no installationId is set.
const TEST_DATA_WITH_ZERO_INSTALL_ID: scaleUpModule.ActionRequestMessage = {
  id: 3,
  eventType: 'workflow_job',
  repositoryName: 'hello-world',
  repositoryOwner: 'Codertocat',
  installationId: 0,
};

const LAUNCH_TEMPLATE = 'lt-1';

const cleanEnv = process.env;

const EXPECTED_RUNNER_PARAMS: RunnerInputParameters = {
  environment: 'unit-test-environment',
  runnerServiceConfig: `--url https://github.enterprise.something/${TEST_DATA.repositoryOwner} --token 1234abcd `,
  runnerType: 'Org',
  runnerOwner: TEST_DATA.repositoryOwner,
};
let expectedRunnerParams: RunnerInputParameters;

beforeEach(() => {
  nock.disableNetConnect();
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...cleanEnv };
  process.env.GITHUB_APP_KEY_BASE64 = 'TEST_CERTIFICATE_DATA';
  process.env.GITHUB_APP_ID = '1337';
  process.env.GITHUB_APP_CLIENT_ID = 'TEST_CLIENT_ID';
  process.env.GITHUB_APP_CLIENT_SECRET = 'TEST_CLIENT_SECRET';
  process.env.RUNNERS_MAXIMUM_COUNT = '3';
  process.env.ENVIRONMENT = 'unit-test-environment';
  process.env.LAUNCH_TEMPLATE_NAME = 'lt-1,lt-2';

  mockOctokit.actions.getJobForWorkflowRun.mockImplementation(() => ({
    data: {
      status: 'queued',
    },
  }));

  mockOctokit.checks.get.mockImplementation(() => ({
    data: {
      status: 'queued',
    },
  }));
  const mockTokenReturnValue = {
    data: {
      token: '1234abcd',
    },
  };
  const mockInstallationIdReturnValueOrgs = {
    data: {
      id: TEST_DATA.installationId,
    },
  };
  const mockInstallationIdReturnValueRepos = {
    data: {
      id: TEST_DATA.installationId,
    },
  };

  mockOctokit.actions.createRegistrationTokenForOrg.mockImplementation(() => mockTokenReturnValue);
  mockOctokit.actions.createRegistrationTokenForRepo.mockImplementation(() => mockTokenReturnValue);
  mockOctokit.apps.getOrgInstallation.mockImplementation(() => mockInstallationIdReturnValueOrgs);
  mockOctokit.apps.getRepoInstallation.mockImplementation(() => mockInstallationIdReturnValueRepos);
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

describe('scaleUp with GHES', () => {
  beforeEach(() => {
    mockedAuth.mockResolvedValue({
      type: 'app',
      token: 'token',
      appId: TEST_DATA.installationId,
      expiresAt: 'some-date',
    });

    mockCreateClient.mockResolvedValue(new mocktokit());

    process.env.GHES_URL = 'https://github.enterprise.something';
  });

  it('ignores non-sqs events', async () => {
    expect.assertions(1);
    expect(scaleUpModule.scaleUp('aws:s3', TEST_DATA)).rejects.toEqual(Error('Cannot handle non-SQS events!'));
  });

  it('checks queued workflows', async () => {
    await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
    expect(mockOctokit.actions.getJobForWorkflowRun).toBeCalledWith({
      job_id: TEST_DATA.id,
      owner: TEST_DATA.repositoryOwner,
      repo: TEST_DATA.repositoryName,
    });
  });

  it('does not list runners when no workflows are queued', async () => {
    mockOctokit.actions.getJobForWorkflowRun.mockImplementation(() => ({
      data: { total_count: 0 },
    }));
    await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
    expect(listRunners).not.toBeCalled();
  });

  describe('on org level', () => {
    beforeEach(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
      expectedRunnerParams = { ...EXPECTED_RUNNER_PARAMS };
    });

    it('gets the current org level runners', async () => {
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(listRunners).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerType: 'Org',
        runnerOwner: TEST_DATA.repositoryOwner,
      });
    });

    it('does not create a token when maximum runners has been reached', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).not.toBeCalled();
    });

    it('creates a token when maximum runners has not been reached', async () => {
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).toBeCalled();
      expect(mockOctokit.actions.createRegistrationTokenForOrg).toBeCalledWith({
        org: TEST_DATA.repositoryOwner,
      });
    });

    it('does not retrieve installation id if already set', async () => {
      const spy = jest.spyOn(ghAuth, 'createGithubAuth');
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.apps.getOrgInstallation).not.toBeCalled();
      expect(mockOctokit.apps.getRepoInstallation).not.toBeCalled();
      expect(spy).toBeCalledWith(
        TEST_DATA.installationId,
        'installation',
        'https://github.enterprise.something/api/v3',
      );
    });

    it('retrieves installation id if not set', async () => {
      const spy = jest.spyOn(ghAuth, 'createGithubAuth');
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA_WITH_ZERO_INSTALL_ID);
      expect(mockOctokit.apps.getRepoInstallation).not.toBeCalled();
      expect(spy).toHaveBeenNthCalledWith(1, undefined, 'app', 'https://github.enterprise.something/api/v3');
      expect(spy).toHaveBeenNthCalledWith(
        2,
        TEST_DATA.installationId,
        'installation',
        'https://github.enterprise.something/api/v3',
      );
    });

    it('creates a runner with correct config', async () => {
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledWith(expectedRunnerParams, 'lt-1');
    });

    it('creates a runner with legacy event check_run', async () => {
      await scaleUpModule.scaleUp('aws:sqs', { ...TEST_DATA, eventType: 'check_run' });
      expect(createRunner).toBeCalledWith(expectedRunnerParams, 'lt-1');
    });

    it('creates a runner with labels in a specific group', async () => {
      process.env.RUNNER_EXTRA_LABELS = 'label1,label2';
      process.env.RUNNER_GROUP_NAME = 'TEST_GROUP';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expectedRunnerParams.runnerServiceConfig =
        expectedRunnerParams.runnerServiceConfig + `--labels label1,label2 --runnergroup TEST_GROUP`;
      expect(createRunner).toBeCalledWith(expectedRunnerParams, 'lt-1');
    });

    it('attempts next launch template if first fails', async () => {
      const mockCreateRunners = mocked(createRunner);
      mockCreateRunners.mockRejectedValueOnce(new Error('no capactiy'));
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledTimes(2);
      expect(createRunner).toHaveBeenNthCalledWith(1, expectedRunnerParams, 'lt-1');
      expect(createRunner).toHaveBeenNthCalledWith(2, expectedRunnerParams, 'lt-2');
      mockCreateRunners.mockReset();
    });

    it('all launch templates fail', async () => {
      const mockCreateRunners = mocked(createRunner);
      mockCreateRunners.mockRejectedValue(new Error('All launch templates failed'));
      await expect(scaleUpModule.scaleUp('aws:sqs', TEST_DATA)).rejects.toThrow('All launch templates failed');
      expect(createRunner).toBeCalledTimes(2);
      expect(createRunner).toHaveBeenNthCalledWith(1, expectedRunnerParams, 'lt-1');
      expect(createRunner).toHaveBeenNthCalledWith(2, expectedRunnerParams, 'lt-2');
      mockCreateRunners.mockReset();
    });
  });

  describe('on repo level', () => {
    beforeEach(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
      expectedRunnerParams = { ...EXPECTED_RUNNER_PARAMS };
      expectedRunnerParams.runnerType = 'Repo';
      expectedRunnerParams.runnerOwner = `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`;
      expectedRunnerParams.runnerServiceConfig =
        `--url ` +
        `https://github.enterprise.something/${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName} ` +
        `--token 1234abcd `;
    });

    it('gets the current repo level runners', async () => {
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(listRunners).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerType: 'Repo',
        runnerOwner: `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
      });
    });

    it('does not create a token when maximum runners has been reached', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForRepo).not.toBeCalled();
    });

    it('creates a token when maximum runners has not been reached', async () => {
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForRepo).toBeCalledWith({
        owner: TEST_DATA.repositoryOwner,
        repo: TEST_DATA.repositoryName,
      });
    });

    it('uses the default runner max count', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = undefined;
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForRepo).toBeCalledWith({
        owner: TEST_DATA.repositoryOwner,
        repo: TEST_DATA.repositoryName,
      });
    });

    it('does not retrieve installation id if already set', async () => {
      const spy = jest.spyOn(ghAuth, 'createGithubAuth');
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.apps.getOrgInstallation).not.toBeCalled();
      expect(mockOctokit.apps.getRepoInstallation).not.toBeCalled();
      expect(spy).toBeCalledWith(
        TEST_DATA.installationId,
        'installation',
        'https://github.enterprise.something/api/v3',
      );
    });

    it('retrieves installation id if not set', async () => {
      const spy = jest.spyOn(ghAuth, 'createGithubAuth');
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA_WITH_ZERO_INSTALL_ID);
      expect(mockOctokit.apps.getOrgInstallation).not.toBeCalled();
      expect(spy).toHaveBeenNthCalledWith(1, undefined, 'app', 'https://github.enterprise.something/api/v3');
      expect(spy).toHaveBeenNthCalledWith(
        2,
        TEST_DATA.installationId,
        'installation',
        'https://github.enterprise.something/api/v3',
      );
    });

    it('creates a runner with correct config and labels', async () => {
      process.env.RUNNER_EXTRA_LABELS = 'label1,label2';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expectedRunnerParams.runnerServiceConfig = expectedRunnerParams.runnerServiceConfig + `--labels label1,label2`;
      expectedRunnerParams.runnerType = 'Repo';
      expectedRunnerParams.runnerOwner = `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`;
      expect(createRunner).toBeCalledWith(expectedRunnerParams, 'lt-1');
    });

    it('creates a runner and ensure the group argument is ignored', async () => {
      process.env.RUNNER_EXTRA_LABELS = 'label1,label2';
      process.env.RUNNER_GROUP_NAME = 'TEST_GROUP_IGNORED';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expectedRunnerParams.runnerServiceConfig =
        `--url ` +
        `https://github.enterprise.something/${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName} ` +
        `--token 1234abcd --labels label1,label2`;
      expectedRunnerParams.runnerOwner = `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`;
      expect(createRunner).toBeCalledWith(expectedRunnerParams, 'lt-1');
    });

    it('attempts next launch template if first fails', async () => {
      const mockCreateRunners = mocked(createRunner);
      mockCreateRunners.mockRejectedValueOnce(new Error('no capactiy'));
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledTimes(2);
      expect(createRunner).toHaveBeenNthCalledWith(1, expectedRunnerParams, 'lt-1');
      expect(createRunner).toHaveBeenNthCalledWith(2, expectedRunnerParams, 'lt-2');
    });
  });
});

describe('scaleUp with public GH', () => {
  it('ignores non-sqs events', async () => {
    expect.assertions(1);
    expect(scaleUpModule.scaleUp('aws:s3', TEST_DATA)).rejects.toEqual(Error('Cannot handle non-SQS events!'));
  });

  it('checks queued workflows', async () => {
    await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
    expect(mockOctokit.actions.getJobForWorkflowRun).toBeCalledWith({
      job_id: TEST_DATA.id,
      owner: TEST_DATA.repositoryOwner,
      repo: TEST_DATA.repositoryName,
    });
  });

  it('does not retrieve installation id if already set', async () => {
    const spy = jest.spyOn(ghAuth, 'createGithubAuth');
    await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
    expect(mockOctokit.apps.getOrgInstallation).not.toBeCalled();
    expect(mockOctokit.apps.getRepoInstallation).not.toBeCalled();
    expect(spy).toBeCalledWith(TEST_DATA.installationId, 'installation', '');
  });

  it('retrieves installation id if not set', async () => {
    const spy = jest.spyOn(ghAuth, 'createGithubAuth');
    await scaleUpModule.scaleUp('aws:sqs', TEST_DATA_WITH_ZERO_INSTALL_ID);
    expect(mockOctokit.apps.getRepoInstallation).not.toBeCalled();
    expect(spy).toHaveBeenNthCalledWith(1, undefined, 'app', '');
    expect(spy).toHaveBeenNthCalledWith(2, TEST_DATA.installationId, 'installation', '');
  });

  it('does not list runners when no workflows are queued', async () => {
    mockOctokit.actions.getJobForWorkflowRun.mockImplementation(() => ({
      data: { status: 'completed' },
    }));
    await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
    expect(listRunners).not.toBeCalled();
  });

  describe('on org level', () => {
    beforeEach(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
      expectedRunnerParams = { ...EXPECTED_RUNNER_PARAMS };
      expectedRunnerParams.runnerServiceConfig =
        `--url https://github.com/${TEST_DATA.repositoryOwner} ` + `--token 1234abcd `;
    });

    it('gets the current org level runners', async () => {
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(listRunners).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerType: 'Org',
        runnerOwner: TEST_DATA.repositoryOwner,
      });
    });

    it('does not create a token when maximum runners has been reached', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).not.toBeCalled();
    });

    it('creates a token when maximum runners has not been reached', async () => {
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).toBeCalled();
      expect(mockOctokit.actions.createRegistrationTokenForOrg).toBeCalledWith({
        org: TEST_DATA.repositoryOwner,
      });
    });

    it('creates a runner with correct config', async () => {
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledWith(expectedRunnerParams, LAUNCH_TEMPLATE);
    });

    it('creates a runner with legacy event check_run', async () => {
      await scaleUpModule.scaleUp('aws:sqs', { ...TEST_DATA, eventType: 'check_run' });
      expect(createRunner).toBeCalledWith(expectedRunnerParams, LAUNCH_TEMPLATE);
    });

    it('creates a runner with labels in s specific group', async () => {
      process.env.RUNNER_EXTRA_LABELS = 'label1,label2';
      process.env.RUNNER_GROUP_NAME = 'TEST_GROUP';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expectedRunnerParams.runnerServiceConfig =
        expectedRunnerParams.runnerServiceConfig + `--labels label1,label2 --runnergroup TEST_GROUP`;
      expect(createRunner).toBeCalledWith(expectedRunnerParams, LAUNCH_TEMPLATE);
    });

    it('attempts next launch template if first fails', async () => {
      const mockCreateRunners = mocked(createRunner);
      mockCreateRunners.mockRejectedValueOnce(new Error('no capactiy'));
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledTimes(2);
      expect(createRunner).toHaveBeenNthCalledWith(1, expectedRunnerParams, 'lt-1');
      expect(createRunner).toHaveBeenNthCalledWith(2, expectedRunnerParams, 'lt-2');
    });
  });

  describe('on repo level', () => {
    beforeEach(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
      expectedRunnerParams = { ...EXPECTED_RUNNER_PARAMS };
      expectedRunnerParams.runnerType = 'Repo';
      expectedRunnerParams.runnerOwner = `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`;
      expectedRunnerParams.runnerServiceConfig =
        `--url https://github.com/${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName} ` + `--token 1234abcd `;
    });

    it('gets the current repo level runners', async () => {
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(listRunners).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerType: 'Repo',
        runnerOwner: `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
      });
    });

    it('does not create a token when maximum runners has been reached', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForRepo).not.toBeCalled();
    });

    it('creates a token when maximum runners has not been reached', async () => {
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForRepo).toBeCalledWith({
        owner: TEST_DATA.repositoryOwner,
        repo: TEST_DATA.repositoryName,
      });
    });

    it('does not retrieve installation id if already set', async () => {
      const spy = jest.spyOn(ghAuth, 'createGithubAuth');
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.apps.getOrgInstallation).not.toBeCalled();
      expect(mockOctokit.apps.getRepoInstallation).not.toBeCalled();
      expect(spy).toBeCalledWith(TEST_DATA.installationId, 'installation', '');
    });

    it('retrieves installation id if not set', async () => {
      const spy = jest.spyOn(ghAuth, 'createGithubAuth');
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA_WITH_ZERO_INSTALL_ID);
      expect(mockOctokit.apps.getOrgInstallation).not.toBeCalled();
      expect(spy).toHaveBeenNthCalledWith(1, undefined, 'app', '');
      expect(spy).toHaveBeenNthCalledWith(2, TEST_DATA.installationId, 'installation', '');
    });

    it('creates a runner with correct config and labels', async () => {
      process.env.RUNNER_EXTRA_LABELS = 'label1,label2';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expectedRunnerParams.runnerServiceConfig = expectedRunnerParams.runnerServiceConfig + `--labels label1,label2`;
      expect(createRunner).toBeCalledWith(expectedRunnerParams, LAUNCH_TEMPLATE);
    });

    it('creates a runner and ensure the group argument is ignored', async () => {
      process.env.RUNNER_EXTRA_LABELS = 'label1,label2';
      process.env.RUNNER_GROUP_NAME = 'TEST_GROUP_IGNORED';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expectedRunnerParams.runnerServiceConfig = expectedRunnerParams.runnerServiceConfig + `--labels label1,label2`;
      expect(createRunner).toBeCalledWith(expectedRunnerParams, LAUNCH_TEMPLATE);
    });

    it('attempts next launch template if first fails', async () => {
      const mockCreateRunners = mocked(createRunner);
      mockCreateRunners.mockRejectedValueOnce(new Error('no capactiy'));
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledTimes(2);
      expect(createRunner).toHaveBeenNthCalledWith(1, expectedRunnerParams, 'lt-1');
      expect(createRunner).toHaveBeenNthCalledWith(2, expectedRunnerParams, 'lt-2');
    });
  });
});
