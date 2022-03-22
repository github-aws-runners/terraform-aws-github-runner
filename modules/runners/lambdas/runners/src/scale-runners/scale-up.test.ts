import { Octokit } from '@octokit/rest';
import { mocked } from 'jest-mock';
import nock from 'nock';

import * as ghAuth from '../gh-auth/gh-auth';
import { RunnerInputParameters, createRunner, listEC2Runners } from './../aws/runners';
import ScaleError from './ScaleError';
import * as scaleUpModule from './scale-up';

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

jest.mock('./../aws/runners');
jest.mock('./../gh-auth/gh-auth');

const mocktokit = Octokit as jest.MockedClass<typeof Octokit>;
const mockedAppAuth = mocked(ghAuth.createGithubAppAuth, true);
const mockedInstallationAuth = mocked(ghAuth.createGithubInstallationAuth, true);
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

const cleanEnv = process.env;

const EXPECTED_RUNNER_PARAMS: RunnerInputParameters = {
  environment: 'unit-test-environment',
  runnerServiceConfig: [`--url https://github.enterprise.something/${TEST_DATA.repositoryOwner}`, '--token 1234abcd'],
  runnerType: 'Org',
  runnerOwner: TEST_DATA.repositoryOwner,
  launchTemplateName: 'lt-1',
  ec2instanceCriteria: {
    instanceTypes: ['m5.large'],
    targetCapacityType: 'spot',
    instanceAllocationStrategy: 'lowest-price',
  },
  subnets: ['subnet-123'],
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
  process.env.LAUNCH_TEMPLATE_NAME = 'lt-1';
  process.env.SUBNET_IDS = 'subnet-123';
  process.env.INSTANCE_TYPES = 'm5.large';
  process.env.INSTANCE_TARGET_CAPACITY_TYPE = 'spot';

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
  const mockListRunners = mocked(listEC2Runners);
  mockListRunners.mockImplementation(async () => [
    {
      instanceId: 'i-1234',
      launchTime: new Date(),
      type: 'Org',
      owner: TEST_DATA.repositoryOwner,
    },
  ]);

  mockedAppAuth.mockResolvedValue({
    type: 'app',
    token: 'token',
    appId: TEST_DATA.installationId,
    expiresAt: 'some-date',
  });
  mockedInstallationAuth.mockResolvedValue({
    type: 'token',
    tokenType: 'installation',
    token: 'token',
    createdAt: 'some-date',
    expiresAt: 'some-date',
    permissions: {},
    repositorySelection: 'all',
    installationId: 0,
  });

  mockCreateClient.mockResolvedValue(new mocktokit());
});

describe('scaleUp with GHES', () => {
  beforeEach(() => {
    process.env.GHES_URL = 'https://github.enterprise.something';
  });

  it('ignores non-sqs events', async () => {
    expect.assertions(1);
    await expect(scaleUpModule.scaleUp('aws:s3', TEST_DATA)).rejects.toEqual(Error('Cannot handle non-SQS events!'));
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
    expect(listEC2Runners).not.toBeCalled();
  });

  describe('on org level', () => {
    beforeEach(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
      expectedRunnerParams = { ...EXPECTED_RUNNER_PARAMS };
    });

    it('gets the current org level runners', async () => {
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(listEC2Runners).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerType: 'Org',
        runnerOwner: TEST_DATA.repositoryOwner,
      });
    });

    it('does not create a token when maximum runners has been reached', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).not.toBeCalled();
      expect(mockOctokit.actions.createRegistrationTokenForRepo).not.toBeCalled();
    });

    it('creates a token when maximum runners has not been reached', async () => {
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).toBeCalledWith({
        org: TEST_DATA.repositoryOwner,
      });
      expect(mockOctokit.actions.createRegistrationTokenForRepo).not.toBeCalled();
    });

    it('does not retrieve installation id if already set', async () => {
      const appSpy = jest.spyOn(ghAuth, 'createGithubAppAuth');
      const installationSpy = jest.spyOn(ghAuth, 'createGithubInstallationAuth');
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.apps.getOrgInstallation).not.toBeCalled();
      expect(mockOctokit.apps.getRepoInstallation).not.toBeCalled();
      expect(appSpy).not.toBeCalled();
      expect(installationSpy).toBeCalledWith(TEST_DATA.installationId, 'https://github.enterprise.something/api/v3');
    });

    it('retrieves installation id if not set', async () => {
      const appSpy = jest.spyOn(ghAuth, 'createGithubAppAuth');
      const installationSpy = jest.spyOn(ghAuth, 'createGithubInstallationAuth');
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA_WITH_ZERO_INSTALL_ID);
      expect(mockOctokit.apps.getRepoInstallation).not.toBeCalled();
      expect(appSpy).toHaveBeenCalledWith(undefined, 'https://github.enterprise.something/api/v3');
      expect(installationSpy).toHaveBeenCalledWith(
        TEST_DATA.installationId,
        'https://github.enterprise.something/api/v3',
      );
    });

    it('creates a runner with correct config', async () => {
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('creates a runner with legacy event check_run', async () => {
      await scaleUpModule.scaleUp('aws:sqs', { ...TEST_DATA, eventType: 'check_run' });
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('creates a runner with labels in a specific group', async () => {
      process.env.RUNNER_EXTRA_LABELS = 'label1,label2';
      process.env.RUNNER_GROUP_NAME = 'TEST_GROUP';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expectedRunnerParams.runnerServiceConfig = [
        ...expectedRunnerParams.runnerServiceConfig,
        '--labels label1,label2',
        '--runnergroup TEST_GROUP',
      ];
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });
  });

  describe('on repo level', () => {
    beforeEach(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
      expectedRunnerParams = { ...EXPECTED_RUNNER_PARAMS };
      expectedRunnerParams.runnerType = 'Repo';
      expectedRunnerParams.runnerOwner = `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`;
      expectedRunnerParams.runnerServiceConfig = [
        `--url https://github.enterprise.something/${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
        `--token 1234abcd`,
      ];
    });

    it('gets the current repo level runners', async () => {
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(listEC2Runners).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerType: 'Repo',
        runnerOwner: `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
      });
    });

    it('does not create a token when maximum runners has been reached', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).not.toBeCalled();
      expect(mockOctokit.actions.createRegistrationTokenForRepo).not.toBeCalled();
    });

    it('creates a token when maximum runners has not been reached', async () => {
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).not.toBeCalled();
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
      const appSpy = jest.spyOn(ghAuth, 'createGithubAppAuth');
      const installationSpy = jest.spyOn(ghAuth, 'createGithubInstallationAuth');
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.apps.getOrgInstallation).not.toBeCalled();
      expect(mockOctokit.apps.getRepoInstallation).not.toBeCalled();
      expect(appSpy).not.toBeCalled();
      expect(installationSpy).toBeCalledWith(TEST_DATA.installationId, 'https://github.enterprise.something/api/v3');
    });

    it('retrieves installation id if not set', async () => {
      const appSpy = jest.spyOn(ghAuth, 'createGithubAppAuth');
      const installationSpy = jest.spyOn(ghAuth, 'createGithubInstallationAuth');
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA_WITH_ZERO_INSTALL_ID);
      expect(mockOctokit.apps.getOrgInstallation).not.toBeCalled();
      expect(mockOctokit.apps.getRepoInstallation).toBeCalledWith({
        owner: TEST_DATA.repositoryOwner,
        repo: TEST_DATA.repositoryName,
      });
      expect(appSpy).toHaveBeenCalledWith(undefined, 'https://github.enterprise.something/api/v3');
      expect(installationSpy).toHaveBeenCalledWith(
        TEST_DATA.installationId,
        'https://github.enterprise.something/api/v3',
      );
    });

    it('creates a runner with correct config and labels', async () => {
      process.env.RUNNER_EXTRA_LABELS = 'label1,label2';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expectedRunnerParams.runnerServiceConfig = [
        ...expectedRunnerParams.runnerServiceConfig,
        `--labels label1,label2`,
      ];
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('creates a runner and ensure the group argument is ignored', async () => {
      process.env.RUNNER_EXTRA_LABELS = 'label1,label2';
      process.env.RUNNER_GROUP_NAME = 'TEST_GROUP_IGNORED';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expectedRunnerParams.runnerServiceConfig = [
        ...expectedRunnerParams.runnerServiceConfig,
        `--labels label1,label2`,
      ];
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('Check error is thrown', async () => {
      const mockCreateRunners = mocked(createRunner);
      mockCreateRunners.mockRejectedValue(new Error('no retry'));
      await expect(scaleUpModule.scaleUp('aws:sqs', TEST_DATA)).rejects.toThrow('no retry');
      mockCreateRunners.mockReset();
    });
  });
});

describe('scaleUp with public GH', () => {
  it('ignores non-sqs events', async () => {
    expect.assertions(1);
    await expect(scaleUpModule.scaleUp('aws:s3', TEST_DATA)).rejects.toEqual(Error('Cannot handle non-SQS events!'));
  });

  it('checks queued workflows', async () => {
    await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
    expect(mockOctokit.actions.getJobForWorkflowRun).toBeCalledWith({
      job_id: TEST_DATA.id,
      owner: TEST_DATA.repositoryOwner,
      repo: TEST_DATA.repositoryName,
    });
  });

  it('not checking queued workflows', async () => {
    process.env.ENABLE_JOB_QUEUED_CHECK = 'false';
    await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
    expect(mockOctokit.actions.getJobForWorkflowRun).not.toBeCalled();
  });

  it('does not retrieve installation id if already set', async () => {
    const appSpy = jest.spyOn(ghAuth, 'createGithubAppAuth');
    const installationSpy = jest.spyOn(ghAuth, 'createGithubInstallationAuth');
    await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
    expect(mockOctokit.apps.getOrgInstallation).not.toBeCalled();
    expect(mockOctokit.apps.getRepoInstallation).not.toBeCalled();
    expect(appSpy).not.toBeCalled();
    expect(installationSpy).toBeCalledWith(TEST_DATA.installationId, '');
  });

  it('retrieves installation id if not set', async () => {
    const appSpy = jest.spyOn(ghAuth, 'createGithubAppAuth');
    const installationSpy = jest.spyOn(ghAuth, 'createGithubInstallationAuth');
    await scaleUpModule.scaleUp('aws:sqs', TEST_DATA_WITH_ZERO_INSTALL_ID);
    expect(mockOctokit.apps.getOrgInstallation).toBeCalled();
    expect(mockOctokit.apps.getRepoInstallation).not.toBeCalled();
    expect(appSpy).toHaveBeenCalledWith(undefined, '');
    expect(installationSpy).toHaveBeenCalledWith(TEST_DATA.installationId, '');
  });

  it('does not list runners when no workflows are queued', async () => {
    mockOctokit.actions.getJobForWorkflowRun.mockImplementation(() => ({
      data: { status: 'completed' },
    }));
    await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
    expect(listEC2Runners).not.toBeCalled();
  });

  it('does not list runners when no workflows are queued (check_run)', async () => {
    mockOctokit.checks.get.mockImplementation(() => ({
      data: { status: 'completed' },
    }));
    await scaleUpModule.scaleUp('aws:sqs', { ...TEST_DATA, eventType: 'check_run' });
    expect(listEC2Runners).not.toBeCalled();
  });

  describe('on org level', () => {
    beforeEach(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
      expectedRunnerParams = { ...EXPECTED_RUNNER_PARAMS };
      expectedRunnerParams.runnerServiceConfig = [
        `--url https://github.com/${TEST_DATA.repositoryOwner}`,
        `--token 1234abcd`,
      ];
    });

    it('gets the current org level runners', async () => {
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(listEC2Runners).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerType: 'Org',
        runnerOwner: TEST_DATA.repositoryOwner,
      });
    });

    it('does not create a token when maximum runners has been reached', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).not.toBeCalled();
      expect(mockOctokit.actions.createRegistrationTokenForRepo).not.toBeCalled();
    });

    it('creates a token when maximum runners has not been reached', async () => {
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).toBeCalledWith({
        org: TEST_DATA.repositoryOwner,
      });
      expect(mockOctokit.actions.createRegistrationTokenForRepo).not.toBeCalled();
    });

    it('creates a runner with correct config', async () => {
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('creates a runner with legacy event check_run', async () => {
      await scaleUpModule.scaleUp('aws:sqs', { ...TEST_DATA, eventType: 'check_run' });
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('creates a runner with labels in s specific group', async () => {
      process.env.RUNNER_EXTRA_LABELS = 'label1,label2';
      process.env.RUNNER_GROUP_NAME = 'TEST_GROUP';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expectedRunnerParams.runnerServiceConfig = [
        ...expectedRunnerParams.runnerServiceConfig,
        `--labels label1,label2`,
        `--runnergroup TEST_GROUP`,
      ];
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });
  });

  describe('on repo level', () => {
    beforeEach(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
      expectedRunnerParams = { ...EXPECTED_RUNNER_PARAMS };
      expectedRunnerParams.runnerType = 'Repo';
      expectedRunnerParams.runnerOwner = `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`;
      expectedRunnerParams.runnerServiceConfig = [
        `--url https://github.com/${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
        `--token 1234abcd`,
      ];
    });

    it('gets the current repo level runners', async () => {
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(listEC2Runners).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerType: 'Repo',
        runnerOwner: `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
      });
    });

    it('does not create a token when maximum runners has been reached', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).not.toBeCalled();
      expect(mockOctokit.actions.createRegistrationTokenForRepo).not.toBeCalled();
    });

    it('creates a token when maximum runners has not been reached', async () => {
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).not.toBeCalled();
      expect(mockOctokit.actions.createRegistrationTokenForRepo).toBeCalledWith({
        owner: TEST_DATA.repositoryOwner,
        repo: TEST_DATA.repositoryName,
      });
    });

    it('does not retrieve installation id if already set', async () => {
      const appSpy = jest.spyOn(ghAuth, 'createGithubAppAuth');
      const installationSpy = jest.spyOn(ghAuth, 'createGithubInstallationAuth');
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.apps.getOrgInstallation).not.toBeCalled();
      expect(mockOctokit.apps.getRepoInstallation).not.toBeCalled();
      expect(appSpy).not.toBeCalled();
      expect(installationSpy).toBeCalledWith(TEST_DATA.installationId, '');
    });

    it('retrieves installation id if not set', async () => {
      const appSpy = jest.spyOn(ghAuth, 'createGithubAppAuth');
      const installationSpy = jest.spyOn(ghAuth, 'createGithubInstallationAuth');
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA_WITH_ZERO_INSTALL_ID);
      expect(mockOctokit.apps.getOrgInstallation).not.toBeCalled();
      expect(mockOctokit.apps.getRepoInstallation).toBeCalled();
      expect(appSpy).toHaveBeenCalledWith(undefined, '');
      expect(installationSpy).toHaveBeenCalledWith(TEST_DATA.installationId, '');
    });

    it('creates a runner with correct config and labels', async () => {
      process.env.RUNNER_EXTRA_LABELS = 'label1,label2';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expectedRunnerParams.runnerServiceConfig = [
        ...expectedRunnerParams.runnerServiceConfig,
        `--labels label1,label2`,
      ];
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('creates a runner and ensure the group argument is ignored', async () => {
      process.env.RUNNER_EXTRA_LABELS = 'label1,label2';
      process.env.RUNNER_GROUP_NAME = 'TEST_GROUP_IGNORED';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expectedRunnerParams.runnerServiceConfig = [
        ...expectedRunnerParams.runnerServiceConfig,
        `--labels label1,label2`,
      ];
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('ephemeral runners only run with workflow_job event, others should fail.', async () => {
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'true';
      process.env.ENABLE_JOB_QUEUED_CHECK = 'false';
      await expect(
        scaleUpModule.scaleUp('aws:sqs', {
          ...TEST_DATA,
          eventType: 'check_run',
        }),
      ).rejects.toBeInstanceOf(Error);
    });

    it('creates a ephemeral runner.', async () => {
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'true';
      process.env.ENABLE_JOB_QUEUED_CHECK = 'false';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expectedRunnerParams.runnerServiceConfig = [...expectedRunnerParams.runnerServiceConfig, `--ephemeral`];
      expect(mockOctokit.actions.getJobForWorkflowRun).not.toBeCalled();
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('creates a ephemeral runner after checking job is queued.', async () => {
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'true';
      process.env.ENABLE_JOB_QUEUED_CHECK = 'true';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.getJobForWorkflowRun).toBeCalled();
      expectedRunnerParams.runnerServiceConfig = [...expectedRunnerParams.runnerServiceConfig, `--ephemeral`];
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('disable auto update on the runner.', async () => {
      process.env.DISABLE_RUNNER_AUTOUPDATE = 'true';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expectedRunnerParams.runnerServiceConfig = [...expectedRunnerParams.runnerServiceConfig, `--disableupdate`];
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('Scaling error should cause reject so retry can be triggered.', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1';
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'true';
      await expect(scaleUpModule.scaleUp('aws:sqs', TEST_DATA)).rejects.toBeInstanceOf(ScaleError);
    });
  });
});
