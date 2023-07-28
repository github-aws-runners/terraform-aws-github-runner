import { GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { Octokit } from '@octokit/rest';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { mocked } from 'jest-mock';
import nock from 'nock';
import { performance } from 'perf_hooks';

import * as ghAuth from '../gh-auth/gh-auth';
import { createRunner, listEC2Runners } from './../aws/runners';
import { RunnerInputParameters } from './../aws/runners.d';
import ScaleError from './ScaleError';
import * as scaleUpModule from './scale-up';

const mockOctokit = {
  paginate: jest.fn(),
  checks: { get: jest.fn() },
  actions: {
    createRegistrationTokenForOrg: jest.fn(),
    createRegistrationTokenForRepo: jest.fn(),
    getJobForWorkflowRun: jest.fn(),
    generateRunnerJitconfigForOrg: jest.fn(),
    generateRunnerJitconfigForRepo: jest.fn(),
  },
  apps: {
    getOrgInstallation: jest.fn(),
    getRepoInstallation: jest.fn(),
  },
};
const mockCreateRunner = mocked(createRunner);
const mockListRunners = mocked(listEC2Runners);
const mockSSMClient = mockClient(SSMClient);

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => mockOctokit),
}));

jest.mock('./../aws/runners');
jest.mock('./../gh-auth/gh-auth');
export type RunnerType = 'ephemeral' | 'non-ephemeral';

// for ephemeral and non-ephemeral runners
const RUNNER_TYPES: RunnerType[] = ['ephemeral', 'non-ephemeral'];

const mocktokit = Octokit as jest.MockedClass<typeof Octokit>;
const mockedAppAuth = mocked(ghAuth.createGithubAppAuth, { shallow: false });
const mockedInstallationAuth = mocked(ghAuth.createGithubInstallationAuth, { shallow: false });
const mockCreateClient = mocked(ghAuth.createOctoClient, { shallow: false });

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
  process.env.ENVIRONMENT = EXPECTED_RUNNER_PARAMS.environment;
  process.env.LAUNCH_TEMPLATE_NAME = 'lt-1';
  process.env.SUBNET_IDS = 'subnet-123';
  process.env.INSTANCE_TYPES = 'm5.large';
  process.env.INSTANCE_TARGET_CAPACITY_TYPE = 'spot';

  mockOctokit.actions.getJobForWorkflowRun.mockImplementation(() => ({
    data: {
      status: 'queued',
    },
  }));
  mockOctokit.paginate.mockImplementation(() => [
    {
      id: 1,
      name: 'Default',
    },
  ]);
  mockOctokit.actions.generateRunnerJitconfigForOrg.mockImplementation(() => ({
    data: {
      encoded_jit_config: 'TEST_JIT_CONFIG_ORG',
    },
  }));
  mockOctokit.actions.generateRunnerJitconfigForRepo.mockImplementation(() => ({
    data: {
      encoded_jit_config: 'TEST_JIT_CONFIG_REPO',
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
  mockCreateRunner.mockImplementation(async () => {
    return ['i-12345'];
  });
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
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'true';
      process.env.RUNNER_NAME_PREFIX = 'unit-test-';
      process.env.RUNNER_GROUP_NAME = 'Default';
      process.env.SSM_CONFIG_PATH = '/github-action-runners/default/runners/config';
      process.env.SSM_TOKEN_PATH = '/github-action-runners/default/runners/config';
      process.env.RUNNER_LABELS = 'label1,label2';

      expectedRunnerParams = { ...EXPECTED_RUNNER_PARAMS };
      mockSSMClient.reset();
      mockSSMClient.on(GetParameterCommand).resolves({ Parameter: { Value: '1' } });
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
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'false';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).not.toBeCalled();
      expect(mockOctokit.actions.createRegistrationTokenForRepo).not.toBeCalled();
    });

    it('creates a token when maximum runners has not been reached', async () => {
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'false';
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

    it('creates a runner with labels in a specific group', async () => {
      process.env.RUNNER_LABELS = 'label1,label2';
      process.env.RUNNER_GROUP_NAME = 'TEST_GROUP';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('creates a runner with ami id override from ssm parameter', async () => {
      process.env.AMI_ID_SSM_PARAMETER_NAME = 'my-ami-id-param';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledWith({ ...expectedRunnerParams, amiIdSsmParameterName: 'my-ami-id-param' });
    });

    it('Throws an error if runner group doesnt exist for ephemeral runners', async () => {
      process.env.RUNNER_GROUP_NAME = 'test-runner-group';
      mockSSMClient.on(GetParameterCommand).rejects();
      await expect(scaleUpModule.scaleUp('aws:sqs', TEST_DATA)).rejects.toBeInstanceOf(Error);
      expect(mockOctokit.paginate).toHaveBeenCalledTimes(1);
    });

    it('create SSM parameter for runner group id if it doesnt exist', async () => {
      mockSSMClient.on(GetParameterCommand).rejects();
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.paginate).toHaveBeenCalledTimes(1);
      expect(mockSSMClient).toHaveReceivedCommandTimes(PutParameterCommand, 2);
      expect(mockSSMClient).toHaveReceivedNthSpecificCommandWith(1, PutParameterCommand, {
        Name: `${process.env.SSM_CONFIG_PATH}/runner-group/${process.env.RUNNER_GROUP_NAME}`,
        Value: '1',
        Type: 'String',
      });
    });

    it('Doesnt create SSM parameter for runner group id if it exists', async () => {
      mockSSMClient.on(GetParameterCommand).resolves({ Parameter: { Value: '1' } });
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.paginate).toHaveBeenCalledTimes(0);
      expect(mockSSMClient).toHaveReceivedCommandTimes(PutParameterCommand, 1);
    });

    it('create start runner config for ephemeral runners ', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '2';
      mockSSMClient.on(GetParameterCommand).resolves({ Parameter: { Value: '1' } });
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.generateRunnerJitconfigForOrg).toBeCalledWith({
        org: TEST_DATA.repositoryOwner,
        name: 'unit-test-i-12345',
        runner_group_id: 1,
        labels: ['label1', 'label2'],
      });
      expect(mockSSMClient).toHaveReceivedNthSpecificCommandWith(1, PutParameterCommand, {
        Name: '/github-action-runners/default/runners/config/i-12345',
        Value: 'TEST_JIT_CONFIG_ORG',
        Type: 'SecureString',
      });
    });

    it('create start runner config for non-ephemeral runners ', async () => {
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'false';
      process.env.RUNNERS_MAXIMUM_COUNT = '2';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.generateRunnerJitconfigForOrg).not.toBeCalled();
      expect(mockOctokit.actions.createRegistrationTokenForOrg).toBeCalled();
      expect(mockSSMClient).toHaveReceivedNthSpecificCommandWith(1, PutParameterCommand, {
        Name: '/github-action-runners/default/runners/config/i-12345',
        Value:
          '--url https://github.enterprise.something/Codertocat --token 1234abcd ' +
          '--labels label1,label2 --runnergroup Default',
        Type: 'SecureString',
      });
    });
    it.each(RUNNER_TYPES)(
      'calls create start runner config of 40' + ' instances (ssm rate limit condition) to test time delay ',
      async (type: RunnerType) => {
        process.env.ENABLE_EPHEMERAL_RUNNERS = type === 'ephemeral' ? 'true' : 'false';
        process.env.RUNNERS_MAXIMUM_COUNT = '40';
        mockCreateRunner.mockImplementation(async () => {
          return instances;
        });
        mockListRunners.mockImplementation(async () => {
          return [];
        });
        mockSSMClient.on(GetParameterCommand).resolves({ Parameter: { Value: '1' } });
        const startTime = performance.now();
        const instances = [
          'i-1234',
          'i-5678',
          'i-5567',
          'i-5569',
          'i-5561',
          'i-5560',
          'i-5566',
          'i-5536',
          'i-5526',
          'i-5516',
          'i-122',
          'i-123',
          'i-124',
          'i-125',
          'i-126',
          'i-127',
          'i-128',
          'i-129',
          'i-130',
          'i-131',
          'i-132',
          'i-133',
          'i-134',
          'i-135',
          'i-136',
          'i-137',
          'i-138',
          'i-139',
          'i-140',
          'i-141',
          'i-142',
          'i-143',
          'i-144',
          'i-145',
          'i-146',
          'i-147',
          'i-148',
          'i-149',
          'i-150',
          'i-151',
        ];
        await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
        const endTime = performance.now();
        expect(endTime - startTime).toBeGreaterThan(1000);
        expect(mockSSMClient).toHaveReceivedCommandTimes(PutParameterCommand, 40);
      },
      10000,
    );
  });
  describe('on repo level', () => {
    beforeEach(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
      process.env.RUNNER_NAME_PREFIX = 'unit-test';
      expectedRunnerParams = { ...EXPECTED_RUNNER_PARAMS };
      expectedRunnerParams.runnerType = 'Repo';
      expectedRunnerParams.runnerOwner = `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`;
      //   `--url https://github.enterprise.something/${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
      //   `--token 1234abcd`,
      // ];
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
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'false';
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
      process.env.RUNNER_LABELS = 'label1,label2';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('creates a runner and ensure the group argument is ignored', async () => {
      process.env.RUNNER_LABELS = 'label1,label2';
      process.env.RUNNER_GROUP_NAME = 'TEST_GROUP_IGNORED';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
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

  describe('on org level', () => {
    beforeEach(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
      process.env.RUNNER_NAME_PREFIX = 'unit-test';
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

    it('creates a runner with correct config', async () => {
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('creates a runner with labels in s specific group', async () => {
      process.env.RUNNER_LABELS = 'label1,label2';
      process.env.RUNNER_GROUP_NAME = 'TEST_GROUP';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });
  });

  describe('on repo level', () => {
    beforeEach(() => {
      mockSSMClient.reset();

      process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
      process.env.RUNNER_NAME_PREFIX = 'unit-test';
      expectedRunnerParams = { ...EXPECTED_RUNNER_PARAMS };
      expectedRunnerParams.runnerType = 'Repo';
      expectedRunnerParams.runnerOwner = `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`;
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
      process.env.RUNNER_LABELS = 'label1,label2';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('creates a runner and ensure the group argument is ignored', async () => {
      process.env.RUNNER_LABELS = 'label1,label2';
      process.env.RUNNER_GROUP_NAME = 'TEST_GROUP_IGNORED';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
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

    it('creates a ephemeral runner with JIT config.', async () => {
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'true';
      process.env.ENABLE_JOB_QUEUED_CHECK = 'false';
      process.env.SSM_TOKEN_PATH = '/github-action-runners/default/runners/config';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.getJobForWorkflowRun).not.toBeCalled();
      expect(createRunner).toBeCalledWith(expectedRunnerParams);

      expect(mockSSMClient).toHaveReceivedNthSpecificCommandWith(1, PutParameterCommand, {
        Name: '/github-action-runners/default/runners/config/i-12345',
        Value: 'TEST_JIT_CONFIG_REPO',
        Type: 'SecureString',
      });
    });

    it('creates a ephemeral runner with registration token.', async () => {
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'true';
      process.env.ENABLE_JIT_CONFIG = 'false';
      process.env.ENABLE_JOB_QUEUED_CHECK = 'false';
      process.env.SSM_TOKEN_PATH = '/github-action-runners/default/runners/config';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.getJobForWorkflowRun).not.toBeCalled();
      expect(createRunner).toBeCalledWith(expectedRunnerParams);

      expect(mockSSMClient).toHaveReceivedNthSpecificCommandWith(1, PutParameterCommand, {
        Name: '/github-action-runners/default/runners/config/i-12345',
        Value: '--url https://github.com/Codertocat/hello-world --token 1234abcd --ephemeral',
        Type: 'SecureString',
      });
    });

    it('JIT config is ingored for non-ephemeral runners.', async () => {
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'false';
      process.env.ENABLE_JIT_CONFIG = 'true';
      process.env.ENABLE_JOB_QUEUED_CHECK = 'false';
      process.env.RUNNER_LABELS = 'jit';
      process.env.SSM_TOKEN_PATH = '/github-action-runners/default/runners/config';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.getJobForWorkflowRun).not.toBeCalled();
      expect(createRunner).toBeCalledWith(expectedRunnerParams);

      expect(mockSSMClient).toHaveReceivedNthSpecificCommandWith(1, PutParameterCommand, {
        Name: '/github-action-runners/default/runners/config/i-12345',
        Value: '--url https://github.com/Codertocat/hello-world --token 1234abcd --labels jit',
        Type: 'SecureString',
      });
    });

    it('creates a ephemeral runner after checking job is queued.', async () => {
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'true';
      process.env.ENABLE_JOB_QUEUED_CHECK = 'true';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.getJobForWorkflowRun).toBeCalled();
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('disable auto update on the runner.', async () => {
      process.env.DISABLE_RUNNER_AUTOUPDATE = 'true';
      await scaleUpModule.scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('Scaling error should cause reject so retry can be triggered.', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1';
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'true';
      await expect(scaleUpModule.scaleUp('aws:sqs', TEST_DATA)).rejects.toBeInstanceOf(ScaleError);
    });
  });
});
