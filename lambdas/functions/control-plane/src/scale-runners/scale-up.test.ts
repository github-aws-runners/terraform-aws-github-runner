import { PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';
// Using vi.mocked instead of jest-mock
import nock from 'nock';
import { performance } from 'perf_hooks';

import * as ghAuth from '../github/auth';
import { createRunner, listEC2Runners } from './../aws/runners';
import { RunnerInputParameters } from './../aws/runners.d';
import * as scaleUpModule from './scale-up';
import { getParameter } from '@aws-github-runner/aws-ssm-util';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Octokit } from '@octokit/rest';

const mockOctokit = {
  paginate: vi.fn(),
  checks: { get: vi.fn() },
  actions: {
    createRegistrationTokenForOrg: vi.fn(),
    createRegistrationTokenForRepo: vi.fn(),
    getJobForWorkflowRun: vi.fn(),
    generateRunnerJitconfigForOrg: vi.fn(),
    generateRunnerJitconfigForRepo: vi.fn(),
  },
  apps: {
    getOrgInstallation: vi.fn(),
    getRepoInstallation: vi.fn(),
  },
};

const mockCreateRunner = vi.mocked(createRunner);
const mockListRunners = vi.mocked(listEC2Runners);
const mockSSMClient = mockClient(SSMClient);
const mockSSMgetParameter = vi.mocked(getParameter);

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(function () {
    return mockOctokit;
  }),
}));

vi.mock('./../aws/runners', async () => ({
  createRunner: vi.fn(),
  listEC2Runners: vi.fn(),
  tag: vi.fn(),
}));

vi.mock('./../github/auth', async () => ({
  createGithubAppAuth: vi.fn(),
  createGithubInstallationAuth: vi.fn(),
  createOctokitClient: vi.fn(),
}));

vi.mock('@aws-github-runner/aws-ssm-util', async () => {
  const actual = (await vi.importActual(
    '@aws-github-runner/aws-ssm-util',
  )) as typeof import('@aws-github-runner/aws-ssm-util');

  return {
    ...actual,
    getParameter: vi.fn(),
  };
});

export type RunnerType = 'ephemeral' | 'non-ephemeral';

// for ephemeral and non-ephemeral runners
const RUNNER_TYPES: RunnerType[] = ['ephemeral', 'non-ephemeral'];

const mockedAppAuth = vi.mocked(ghAuth.createGithubAppAuth);
const mockedInstallationAuth = vi.mocked(ghAuth.createGithubInstallationAuth);
const mockCreateClient = vi.mocked(ghAuth.createOctokitClient);

const TEST_DATA_SINGLE: scaleUpModule.ActionRequestMessageSQS = {
  id: 1,
  eventType: 'workflow_job',
  repositoryName: 'hello-world',
  repositoryOwner: 'Codertocat',
  installationId: 2,
  repoOwnerType: 'Organization',
  messageId: 'foobar',
};

const TEST_DATA: scaleUpModule.ActionRequestMessageSQS[] = [
  {
    ...TEST_DATA_SINGLE,
    messageId: 'foobar',
  },
];

const cleanEnv = process.env;

const EXPECTED_RUNNER_PARAMS: RunnerInputParameters = {
  environment: 'unit-test-environment',
  runnerType: 'Org',
  runnerOwner: TEST_DATA_SINGLE.repositoryOwner,
  numberOfRunners: 1,
  launchTemplateName: 'lt-1',
  ec2instanceCriteria: {
    instanceTypes: ['m5.large'],
    targetCapacityType: 'spot',
    instanceAllocationStrategy: 'lowest-price',
  },
  subnets: ['subnet-123'],
  tracingEnabled: false,
  onDemandFailoverOnError: [],
};
let expectedRunnerParams: RunnerInputParameters;

function setDefaults() {
  process.env = { ...cleanEnv };
  process.env.PARAMETER_GITHUB_APP_ID_NAME = 'github-app-id';
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
  process.env.ENABLE_ON_DEMAND_FAILOVER = undefined;
}

beforeEach(() => {
  nock.disableNetConnect();
  vi.resetModules();
  vi.clearAllMocks();
  setDefaults();

  defaultSSMGetParameterMockImpl();
  defaultOctokitMockImpl();

  mockCreateRunner.mockImplementation(async () => {
    return ['i-12345'];
  });
  mockListRunners.mockImplementation(async () => [
    {
      instanceId: 'i-1234',
      launchTime: new Date(),
      type: 'Org',
      owner: TEST_DATA_SINGLE.repositoryOwner,
    },
  ]);

  mockedAppAuth.mockResolvedValue({
    type: 'app',
    token: 'token',
    appId: TEST_DATA_SINGLE.installationId,
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

  mockCreateClient.mockResolvedValue(mockOctokit as unknown as Octokit);
});

describe('scaleUp with GHES', () => {
  beforeEach(() => {
    process.env.GHES_URL = 'https://github.enterprise.something';
  });

  it('checks queued workflows', async () => {
    await scaleUpModule.scaleUp(TEST_DATA);
    expect(mockOctokit.actions.getJobForWorkflowRun).toBeCalledWith({
      job_id: TEST_DATA_SINGLE.id,
      owner: TEST_DATA_SINGLE.repositoryOwner,
      repo: TEST_DATA_SINGLE.repositoryName,
    });
  });

  it('does not list runners when no workflows are queued', async () => {
    mockOctokit.actions.getJobForWorkflowRun.mockImplementation(() => ({
      data: { total_count: 0 },
    }));
    await scaleUpModule.scaleUp(TEST_DATA);
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
    });

    it('gets the current org level runners', async () => {
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(listEC2Runners).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerType: 'Org',
        runnerOwner: TEST_DATA_SINGLE.repositoryOwner,
      });
    });

    it('does not create a token when maximum runners has been reached', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1';
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'false';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).not.toBeCalled();
      expect(mockOctokit.actions.createRegistrationTokenForRepo).not.toBeCalled();
    });

    it('does create a runner if maximum is set to -1', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '-1';
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'false';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(listEC2Runners).not.toHaveBeenCalled();
      expect(createRunner).toHaveBeenCalled();
    });

    it('creates a token when maximum runners has not been reached', async () => {
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'false';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).toBeCalledWith({
        org: TEST_DATA_SINGLE.repositoryOwner,
      });
      expect(mockOctokit.actions.createRegistrationTokenForRepo).not.toBeCalled();
    });

    it('creates a runner with correct config', async () => {
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('creates a runner with labels in a specific group', async () => {
      process.env.RUNNER_LABELS = 'label1,label2';
      process.env.RUNNER_GROUP_NAME = 'TEST_GROUP';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('creates a runner with ami id override from ssm parameter', async () => {
      process.env.AMI_ID_SSM_PARAMETER_NAME = 'my-ami-id-param';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(createRunner).toBeCalledWith({ ...expectedRunnerParams, amiIdSsmParameterName: 'my-ami-id-param' });
    });

    it('Throws an error if runner group does not exist for ephemeral runners', async () => {
      process.env.RUNNER_GROUP_NAME = 'test-runner-group';
      mockSSMgetParameter.mockImplementation(async () => {
        throw new Error('ParameterNotFound');
      });
      await expect(scaleUpModule.scaleUp(TEST_DATA)).rejects.toBeInstanceOf(Error);
      expect(mockOctokit.paginate).toHaveBeenCalledTimes(1);
    });

    it('Discards event if it is a User repo and org level runners is enabled', async () => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
      const USER_REPO_TEST_DATA = structuredClone(TEST_DATA);
      USER_REPO_TEST_DATA[0].repoOwnerType = 'User';
      await scaleUpModule.scaleUp(USER_REPO_TEST_DATA);
      expect(createRunner).not.toHaveBeenCalled();
    });

    it('create SSM parameter for runner group id if it does not exist', async () => {
      mockSSMgetParameter.mockImplementation(async () => {
        throw new Error('ParameterNotFound');
      });
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.paginate).toHaveBeenCalledTimes(1);
      expect(mockSSMClient).toHaveReceivedCommandTimes(PutParameterCommand, 2);
      expect(mockSSMClient).toHaveReceivedNthSpecificCommandWith(1, PutParameterCommand, {
        Name: `${process.env.SSM_CONFIG_PATH}/runner-group/${process.env.RUNNER_GROUP_NAME}`,
        Value: '1',
        Type: 'String',
      });
    });

    it('Does not create SSM parameter for runner group id if it exists', async () => {
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.paginate).toHaveBeenCalledTimes(0);
      expect(mockSSMClient).toHaveReceivedCommandTimes(PutParameterCommand, 1);
    });

    it('create start runner config for ephemeral runners ', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '2';

      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.actions.generateRunnerJitconfigForOrg).toBeCalledWith({
        org: TEST_DATA_SINGLE.repositoryOwner,
        name: 'unit-test-i-12345',
        runner_group_id: 1,
        labels: ['label1', 'label2'],
      });
      expect(mockSSMClient).toHaveReceivedNthSpecificCommandWith(1, PutParameterCommand, {
        Name: '/github-action-runners/default/runners/config/i-12345',
        Value: 'TEST_JIT_CONFIG_ORG',
        Type: 'SecureString',
        Tags: [
          {
            Key: 'InstanceId',
            Value: 'i-12345',
          },
        ],
      });
    });

    it('create start runner config for non-ephemeral runners ', async () => {
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'false';
      process.env.RUNNERS_MAXIMUM_COUNT = '2';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.actions.generateRunnerJitconfigForOrg).not.toBeCalled();
      expect(mockOctokit.actions.createRegistrationTokenForOrg).toBeCalled();
      expect(mockSSMClient).toHaveReceivedNthSpecificCommandWith(1, PutParameterCommand, {
        Name: '/github-action-runners/default/runners/config/i-12345',
        Value:
          '--url https://github.enterprise.something/Codertocat --token 1234abcd ' +
          '--labels label1,label2 --runnergroup Default',
        Type: 'SecureString',
        Tags: [
          {
            Key: 'InstanceId',
            Value: 'i-12345',
          },
        ],
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
        await scaleUpModule.scaleUp(TEST_DATA);
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
      expectedRunnerParams.runnerOwner = `${TEST_DATA_SINGLE.repositoryOwner}/${TEST_DATA_SINGLE.repositoryName}`;
      //   `--url https://github.enterprise.something/${TEST_DATA_SINGLE.repositoryOwner}/${TEST_DATA_SINGLE.repositoryName}`,
      //   `--token 1234abcd`,
      // ];
    });

    it('gets the current repo level runners', async () => {
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(listEC2Runners).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerType: 'Repo',
        runnerOwner: `${TEST_DATA_SINGLE.repositoryOwner}/${TEST_DATA_SINGLE.repositoryName}`,
      });
    });

    it('does not create a token when maximum runners has been reached', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).not.toBeCalled();
      expect(mockOctokit.actions.createRegistrationTokenForRepo).not.toBeCalled();
    });

    it('creates a token when maximum runners has not been reached', async () => {
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'false';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).not.toBeCalled();
      expect(mockOctokit.actions.createRegistrationTokenForRepo).toBeCalledWith({
        owner: TEST_DATA_SINGLE.repositoryOwner,
        repo: TEST_DATA_SINGLE.repositoryName,
      });
    });

    it('uses the default runner max count', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = undefined;
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForRepo).toBeCalledWith({
        owner: TEST_DATA_SINGLE.repositoryOwner,
        repo: TEST_DATA_SINGLE.repositoryName,
      });
    });

    it('creates a runner with correct config and labels', async () => {
      process.env.RUNNER_LABELS = 'label1,label2';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('creates a runner and ensure the group argument is ignored', async () => {
      process.env.RUNNER_LABELS = 'label1,label2';
      process.env.RUNNER_GROUP_NAME = 'TEST_GROUP_IGNORED';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('Check error is thrown', async () => {
      const mockCreateRunners = vi.mocked(createRunner);
      mockCreateRunners.mockRejectedValue(new Error('no retry'));
      await expect(scaleUpModule.scaleUp(TEST_DATA)).rejects.toThrow('no retry');
      mockCreateRunners.mockReset();
    });
  });

  describe('Batch processing', () => {
    beforeEach(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'true';
      process.env.RUNNERS_MAXIMUM_COUNT = '10';
    });

    const createTestMessages = (
      count: number,
      overrides: Partial<scaleUpModule.ActionRequestMessageSQS>[] = [],
    ): scaleUpModule.ActionRequestMessageSQS[] => {
      return Array.from({ length: count }, (_, i) => ({
        ...TEST_DATA_SINGLE,
        id: i + 1,
        messageId: `message-${i}`,
        ...overrides[i],
      }));
    };

    it('Should handle multiple messages for the same organization', async () => {
      const messages = createTestMessages(3);
      await scaleUpModule.scaleUp(messages);

      expect(createRunner).toHaveBeenCalledTimes(1);
      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 3,
          runnerOwner: TEST_DATA_SINGLE.repositoryOwner,
        }),
      );
    });

    it('Should handle multiple messages for different organizations', async () => {
      const messages = createTestMessages(3, [
        { repositoryOwner: 'org1' },
        { repositoryOwner: 'org2' },
        { repositoryOwner: 'org1' },
      ]);

      await scaleUpModule.scaleUp(messages);

      expect(createRunner).toHaveBeenCalledTimes(2);
      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 2,
          runnerOwner: 'org1',
        }),
      );
      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 1,
          runnerOwner: 'org2',
        }),
      );
    });

    it('Should handle multiple messages for different repositories when org-level is disabled', async () => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
      const messages = createTestMessages(3, [
        { repositoryOwner: 'owner1', repositoryName: 'repo1' },
        { repositoryOwner: 'owner1', repositoryName: 'repo2' },
        { repositoryOwner: 'owner1', repositoryName: 'repo1' },
      ]);

      await scaleUpModule.scaleUp(messages);

      expect(createRunner).toHaveBeenCalledTimes(2);
      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 2,
          runnerOwner: 'owner1/repo1',
        }),
      );
      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 1,
          runnerOwner: 'owner1/repo2',
        }),
      );
    });

    it('Should reject messages when maximum runners limit is reached', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1'; // Set to 1 so with 1 existing, no new ones can be created
      mockListRunners.mockImplementation(async () => [
        {
          instanceId: 'i-existing',
          launchTime: new Date(),
          type: 'Org',
          owner: TEST_DATA_SINGLE.repositoryOwner,
        },
      ]);

      const messages = createTestMessages(3);
      const rejectedMessages = await scaleUpModule.scaleUp(messages);

      expect(createRunner).not.toHaveBeenCalled(); // No runners should be created
      expect(rejectedMessages).toHaveLength(3); // All 3 messages should be rejected
    });

    it('Should handle partial EC2 instance creation failures', async () => {
      mockCreateRunner.mockImplementation(async () => ['i-12345']); // Only creates 1 instead of requested 3

      const messages = createTestMessages(3);
      const rejectedMessages = await scaleUpModule.scaleUp(messages);

      expect(rejectedMessages).toHaveLength(2); // 3 requested - 1 created = 2 failed
      expect(rejectedMessages).toEqual(['message-0', 'message-1']);
    });

    it('Should filter out invalid event types for ephemeral runners', async () => {
      const messages = createTestMessages(3, [
        { eventType: 'workflow_job' },
        { eventType: 'check_run' },
        { eventType: 'workflow_job' },
      ]);

      const rejectedMessages = await scaleUpModule.scaleUp(messages);

      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 2, // Only workflow_job events processed
        }),
      );
      expect(rejectedMessages).toContain('message-1'); // check_run event rejected
    });

    it('Should skip invalid repo owner types but not reject them', async () => {
      const messages = createTestMessages(3, [
        { repoOwnerType: 'Organization' },
        { repoOwnerType: 'User' }, // Invalid for org-level runners
        { repoOwnerType: 'Organization' },
      ]);

      const rejectedMessages = await scaleUpModule.scaleUp(messages);

      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 2, // Only Organization events processed
        }),
      );
      expect(rejectedMessages).not.toContain('message-1'); // User repo not rejected, just skipped
    });

    it('Should skip messages when jobs are not queued', async () => {
      mockOctokit.actions.getJobForWorkflowRun.mockImplementation((params) => {
        const isQueued = params.job_id === 1 || params.job_id === 3; // Only jobs 1 and 3 are queued
        return {
          data: {
            status: isQueued ? 'queued' : 'completed',
          },
        };
      });

      const messages = createTestMessages(3);
      await scaleUpModule.scaleUp(messages);

      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 2, // Only queued jobs processed
        }),
      );
    });

    it('Should create separate GitHub clients for different installations', async () => {
      // Override the default mock to return different installation IDs
      mockOctokit.apps.getOrgInstallation.mockReset();
      mockOctokit.apps.getOrgInstallation.mockImplementation((params) => ({
        data: {
          id: params.org === 'org1' ? 100 : 200,
        },
      }));

      const messages = createTestMessages(2, [
        { repositoryOwner: 'org1', installationId: 0 },
        { repositoryOwner: 'org2', installationId: 0 },
      ]);

      await scaleUpModule.scaleUp(messages);

      expect(mockCreateClient).toHaveBeenCalledTimes(3); // 1 app client, 2 repo installation clients
      expect(mockedInstallationAuth).toHaveBeenCalledWith(100, 'https://github.enterprise.something/api/v3');
      expect(mockedInstallationAuth).toHaveBeenCalledWith(200, 'https://github.enterprise.something/api/v3');
    });

    it('Should reuse GitHub clients for same installation', async () => {
      const messages = createTestMessages(3, [
        { repositoryOwner: 'same-org' },
        { repositoryOwner: 'same-org' },
        { repositoryOwner: 'same-org' },
      ]);

      await scaleUpModule.scaleUp(messages);

      expect(mockCreateClient).toHaveBeenCalledTimes(2); // 1 app client, 1 installation client
      expect(mockedInstallationAuth).toHaveBeenCalledTimes(1);
    });

    it('Should return empty array when no valid messages to process', async () => {
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'true';
      const messages = createTestMessages(2, [
        { eventType: 'check_run' }, // Invalid for ephemeral
        { eventType: 'check_run' }, // Invalid for ephemeral
      ]);

      const rejectedMessages = await scaleUpModule.scaleUp(messages);

      expect(createRunner).not.toHaveBeenCalled();
      expect(rejectedMessages).toEqual(['message-0', 'message-1']);
    });

    it('Should handle unlimited runners configuration', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '-1';
      const messages = createTestMessages(10);

      await scaleUpModule.scaleUp(messages);

      expect(listEC2Runners).not.toHaveBeenCalled(); // No need to check current runners
      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 10, // All messages processed
        }),
      );
    });
  });
});

describe('scaleUp with public GH', () => {
  it('checks queued workflows', async () => {
    await scaleUpModule.scaleUp(TEST_DATA);
    expect(mockOctokit.actions.getJobForWorkflowRun).toBeCalledWith({
      job_id: TEST_DATA_SINGLE.id,
      owner: TEST_DATA_SINGLE.repositoryOwner,
      repo: TEST_DATA_SINGLE.repositoryName,
    });
  });

  it('not checking queued workflows', async () => {
    process.env.ENABLE_JOB_QUEUED_CHECK = 'false';
    await scaleUpModule.scaleUp(TEST_DATA);
    expect(mockOctokit.actions.getJobForWorkflowRun).not.toBeCalled();
  });

  it('does not list runners when no workflows are queued', async () => {
    mockOctokit.actions.getJobForWorkflowRun.mockImplementation(() => ({
      data: { status: 'completed' },
    }));
    await scaleUpModule.scaleUp(TEST_DATA);
    expect(listEC2Runners).not.toBeCalled();
  });

  describe('on org level', () => {
    beforeEach(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
      process.env.RUNNER_NAME_PREFIX = 'unit-test';
      expectedRunnerParams = { ...EXPECTED_RUNNER_PARAMS };
    });

    it('gets the current org level runners', async () => {
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(listEC2Runners).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerType: 'Org',
        runnerOwner: TEST_DATA_SINGLE.repositoryOwner,
      });
    });

    it('does not create a token when maximum runners has been reached', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).not.toBeCalled();
      expect(mockOctokit.actions.createRegistrationTokenForRepo).not.toBeCalled();
    });

    it('creates a token when maximum runners has not been reached', async () => {
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).toBeCalledWith({
        org: TEST_DATA_SINGLE.repositoryOwner,
      });
      expect(mockOctokit.actions.createRegistrationTokenForRepo).not.toBeCalled();
    });

    it('creates a runner with correct config', async () => {
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('creates a runner with labels in s specific group', async () => {
      process.env.RUNNER_LABELS = 'label1,label2';
      process.env.RUNNER_GROUP_NAME = 'TEST_GROUP';
      await scaleUpModule.scaleUp(TEST_DATA);
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
      expectedRunnerParams.runnerOwner = `${TEST_DATA_SINGLE.repositoryOwner}/${TEST_DATA_SINGLE.repositoryName}`;
    });

    it('gets the current repo level runners', async () => {
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(listEC2Runners).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerType: 'Repo',
        runnerOwner: `${TEST_DATA_SINGLE.repositoryOwner}/${TEST_DATA_SINGLE.repositoryName}`,
      });
    });

    it('does not create a token when maximum runners has been reached', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).not.toBeCalled();
      expect(mockOctokit.actions.createRegistrationTokenForRepo).not.toBeCalled();
    });

    it('creates a token when maximum runners has not been reached', async () => {
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).not.toBeCalled();
      expect(mockOctokit.actions.createRegistrationTokenForRepo).toBeCalledWith({
        owner: TEST_DATA_SINGLE.repositoryOwner,
        repo: TEST_DATA_SINGLE.repositoryName,
      });
    });

    it('creates a runner with correct config and labels', async () => {
      process.env.RUNNER_LABELS = 'label1,label2';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('creates a runner with correct config and labels and on demand failover enabled.', async () => {
      process.env.RUNNER_LABELS = 'label1,label2';
      process.env.ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS = JSON.stringify(['InsufficientInstanceCapacity']);
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(createRunner).toBeCalledWith({
        ...expectedRunnerParams,
        onDemandFailoverOnError: ['InsufficientInstanceCapacity'],
      });
    });

    it('creates a runner and ensure the group argument is ignored', async () => {
      process.env.RUNNER_LABELS = 'label1,label2';
      process.env.RUNNER_GROUP_NAME = 'TEST_GROUP_IGNORED';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('ephemeral runners only run with workflow_job event, others should fail.', async () => {
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'true';
      process.env.ENABLE_JOB_QUEUED_CHECK = 'false';

      const USER_REPO_TEST_DATA = structuredClone(TEST_DATA);
      USER_REPO_TEST_DATA[0].eventType = 'check_run';

      await expect(scaleUpModule.scaleUp(USER_REPO_TEST_DATA)).resolves.toEqual(['foobar']);
    });

    it('creates a ephemeral runner with JIT config.', async () => {
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'true';
      process.env.ENABLE_JOB_QUEUED_CHECK = 'false';
      process.env.SSM_TOKEN_PATH = '/github-action-runners/default/runners/config';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.actions.getJobForWorkflowRun).not.toBeCalled();
      expect(createRunner).toBeCalledWith(expectedRunnerParams);

      expect(mockSSMClient).toHaveReceivedNthSpecificCommandWith(1, PutParameterCommand, {
        Name: '/github-action-runners/default/runners/config/i-12345',
        Value: 'TEST_JIT_CONFIG_REPO',
        Type: 'SecureString',
        Tags: [
          {
            Key: 'InstanceId',
            Value: 'i-12345',
          },
        ],
      });
    });

    it('creates a ephemeral runner with registration token.', async () => {
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'true';
      process.env.ENABLE_JIT_CONFIG = 'false';
      process.env.ENABLE_JOB_QUEUED_CHECK = 'false';
      process.env.SSM_TOKEN_PATH = '/github-action-runners/default/runners/config';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.actions.getJobForWorkflowRun).not.toBeCalled();
      expect(createRunner).toBeCalledWith(expectedRunnerParams);

      expect(mockSSMClient).toHaveReceivedNthSpecificCommandWith(1, PutParameterCommand, {
        Name: '/github-action-runners/default/runners/config/i-12345',
        Value: '--url https://github.com/Codertocat/hello-world --token 1234abcd --ephemeral',
        Type: 'SecureString',
        Tags: [
          {
            Key: 'InstanceId',
            Value: 'i-12345',
          },
        ],
      });
    });

    it('JIT config is ignored for non-ephemeral runners.', async () => {
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'false';
      process.env.ENABLE_JIT_CONFIG = 'true';
      process.env.ENABLE_JOB_QUEUED_CHECK = 'false';
      process.env.RUNNER_LABELS = 'jit';
      process.env.SSM_TOKEN_PATH = '/github-action-runners/default/runners/config';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.actions.getJobForWorkflowRun).not.toBeCalled();
      expect(createRunner).toBeCalledWith(expectedRunnerParams);

      expect(mockSSMClient).toHaveReceivedNthSpecificCommandWith(1, PutParameterCommand, {
        Name: '/github-action-runners/default/runners/config/i-12345',
        Value: '--url https://github.com/Codertocat/hello-world --token 1234abcd --labels jit',
        Type: 'SecureString',
        Tags: [
          {
            Key: 'InstanceId',
            Value: 'i-12345',
          },
        ],
      });
    });

    it('creates a ephemeral runner after checking job is queued.', async () => {
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'true';
      process.env.ENABLE_JOB_QUEUED_CHECK = 'true';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.actions.getJobForWorkflowRun).toBeCalled();
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('disable auto update on the runner.', async () => {
      process.env.DISABLE_RUNNER_AUTOUPDATE = 'true';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('Scaling error should return failed message IDs so retry can be triggered.', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1';
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'true';
      await expect(scaleUpModule.scaleUp(TEST_DATA)).resolves.toEqual(['foobar']);
    });
  });

  describe('Batch processing', () => {
    const createTestMessages = (
      count: number,
      overrides: Partial<scaleUpModule.ActionRequestMessageSQS>[] = [],
    ): scaleUpModule.ActionRequestMessageSQS[] => {
      return Array.from({ length: count }, (_, i) => ({
        ...TEST_DATA_SINGLE,
        id: i + 1,
        messageId: `message-${i}`,
        ...overrides[i],
      }));
    };

    beforeEach(() => {
      setDefaults();
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'true';
      process.env.RUNNERS_MAXIMUM_COUNT = '10';
    });

    it('Should handle multiple messages for the same organization', async () => {
      const messages = createTestMessages(3);
      await scaleUpModule.scaleUp(messages);

      expect(createRunner).toHaveBeenCalledTimes(1);
      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 3,
          runnerOwner: TEST_DATA_SINGLE.repositoryOwner,
        }),
      );
    });

    it('Should handle multiple messages for different organizations', async () => {
      const messages = createTestMessages(3, [
        { repositoryOwner: 'org1' },
        { repositoryOwner: 'org2' },
        { repositoryOwner: 'org1' },
      ]);

      await scaleUpModule.scaleUp(messages);

      expect(createRunner).toHaveBeenCalledTimes(2);
      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 2,
          runnerOwner: 'org1',
        }),
      );
      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 1,
          runnerOwner: 'org2',
        }),
      );
    });

    it('Should handle multiple messages for different repositories when org-level is disabled', async () => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
      const messages = createTestMessages(3, [
        { repositoryOwner: 'owner1', repositoryName: 'repo1' },
        { repositoryOwner: 'owner1', repositoryName: 'repo2' },
        { repositoryOwner: 'owner1', repositoryName: 'repo1' },
      ]);

      await scaleUpModule.scaleUp(messages);

      expect(createRunner).toHaveBeenCalledTimes(2);
      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 2,
          runnerOwner: 'owner1/repo1',
        }),
      );
      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 1,
          runnerOwner: 'owner1/repo2',
        }),
      );
    });

    it('Should reject messages when maximum runners limit is reached', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1'; // Set to 1 so with 1 existing, no new ones can be created
      mockListRunners.mockImplementation(async () => [
        {
          instanceId: 'i-existing',
          launchTime: new Date(),
          type: 'Org',
          owner: TEST_DATA_SINGLE.repositoryOwner,
        },
      ]);

      const messages = createTestMessages(3);
      const rejectedMessages = await scaleUpModule.scaleUp(messages);

      expect(createRunner).not.toHaveBeenCalled(); // No runners should be created
      expect(rejectedMessages).toHaveLength(3); // All 3 messages should be rejected
    });

    it('Should handle partial EC2 instance creation failures', async () => {
      mockCreateRunner.mockImplementation(async () => ['i-12345']); // Only creates 1 instead of requested 3

      const messages = createTestMessages(3);
      const rejectedMessages = await scaleUpModule.scaleUp(messages);

      expect(rejectedMessages).toHaveLength(2); // 3 requested - 1 created = 2 failed
      expect(rejectedMessages).toEqual(['message-0', 'message-1']);
    });

    it('Should filter out invalid event types for ephemeral runners', async () => {
      const messages = createTestMessages(3, [
        { eventType: 'workflow_job' },
        { eventType: 'check_run' },
        { eventType: 'workflow_job' },
      ]);

      const rejectedMessages = await scaleUpModule.scaleUp(messages);

      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 2, // Only workflow_job events processed
        }),
      );
      expect(rejectedMessages).toContain('message-1'); // check_run event rejected
    });

    it('Should skip invalid repo owner types but not reject them', async () => {
      const messages = createTestMessages(3, [
        { repoOwnerType: 'Organization' },
        { repoOwnerType: 'User' }, // Invalid for org-level runners
        { repoOwnerType: 'Organization' },
      ]);

      const rejectedMessages = await scaleUpModule.scaleUp(messages);

      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 2, // Only Organization events processed
        }),
      );
      expect(rejectedMessages).not.toContain('message-1'); // User repo not rejected, just skipped
    });

    it('Should skip messages when jobs are not queued', async () => {
      mockOctokit.actions.getJobForWorkflowRun.mockImplementation((params) => {
        const isQueued = params.job_id === 1 || params.job_id === 3; // Only jobs 1 and 3 are queued
        return {
          data: {
            status: isQueued ? 'queued' : 'completed',
          },
        };
      });

      const messages = createTestMessages(3);
      await scaleUpModule.scaleUp(messages);

      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 2, // Only queued jobs processed
        }),
      );
    });

    it('Should create separate GitHub clients for different installations', async () => {
      // Override the default mock to return different installation IDs
      mockOctokit.apps.getOrgInstallation.mockReset();
      mockOctokit.apps.getOrgInstallation.mockImplementation((params) => ({
        data: {
          id: params.org === 'org1' ? 100 : 200,
        },
      }));

      const messages = createTestMessages(2, [
        { repositoryOwner: 'org1', installationId: 0 },
        { repositoryOwner: 'org2', installationId: 0 },
      ]);

      await scaleUpModule.scaleUp(messages);

      expect(mockCreateClient).toHaveBeenCalledTimes(3); // 1 app client, 2 repo installation clients
      expect(mockedInstallationAuth).toHaveBeenCalledWith(100, '');
      expect(mockedInstallationAuth).toHaveBeenCalledWith(200, '');
    });

    it('Should reuse GitHub clients for same installation', async () => {
      const messages = createTestMessages(3, [
        { repositoryOwner: 'same-org' },
        { repositoryOwner: 'same-org' },
        { repositoryOwner: 'same-org' },
      ]);

      await scaleUpModule.scaleUp(messages);

      expect(mockCreateClient).toHaveBeenCalledTimes(2); // 1 app client, 1 installation client
      expect(mockedInstallationAuth).toHaveBeenCalledTimes(1);
    });

    it('Should return empty array when no valid messages to process', async () => {
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'true';
      const messages = createTestMessages(2, [
        { eventType: 'check_run' }, // Invalid for ephemeral
        { eventType: 'check_run' }, // Invalid for ephemeral
      ]);

      const rejectedMessages = await scaleUpModule.scaleUp(messages);

      expect(createRunner).not.toHaveBeenCalled();
      expect(rejectedMessages).toEqual(['message-0', 'message-1']);
    });

    it('Should handle unlimited runners configuration', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '-1';
      const messages = createTestMessages(10);

      await scaleUpModule.scaleUp(messages);

      expect(listEC2Runners).not.toHaveBeenCalled(); // No need to check current runners
      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 10, // All messages processed
        }),
      );
    });
  });
});

describe('scaleUp with Github Data Residency', () => {
  beforeEach(() => {
    process.env.GHES_URL = 'https://companyname.ghe.com';
  });

  it('checks queued workflows', async () => {
    await scaleUpModule.scaleUp(TEST_DATA);
    expect(mockOctokit.actions.getJobForWorkflowRun).toBeCalledWith({
      job_id: TEST_DATA_SINGLE.id,
      owner: TEST_DATA_SINGLE.repositoryOwner,
      repo: TEST_DATA_SINGLE.repositoryName,
    });
  });

  it('does not list runners when no workflows are queued', async () => {
    mockOctokit.actions.getJobForWorkflowRun.mockImplementation(() => ({
      data: { total_count: 0 },
    }));
    await scaleUpModule.scaleUp(TEST_DATA);
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
    });

    it('gets the current org level runners', async () => {
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(listEC2Runners).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerType: 'Org',
        runnerOwner: TEST_DATA_SINGLE.repositoryOwner,
      });
    });

    it('does not create a token when maximum runners has been reached', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1';
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'false';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).not.toBeCalled();
      expect(mockOctokit.actions.createRegistrationTokenForRepo).not.toBeCalled();
    });

    it('does create a runner if maximum is set to -1', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '-1';
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'false';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(listEC2Runners).not.toHaveBeenCalled();
      expect(createRunner).toHaveBeenCalled();
    });

    it('creates a token when maximum runners has not been reached', async () => {
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'false';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).toBeCalledWith({
        org: TEST_DATA_SINGLE.repositoryOwner,
      });
      expect(mockOctokit.actions.createRegistrationTokenForRepo).not.toBeCalled();
    });

    it('creates a runner with correct config', async () => {
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('creates a runner with labels in a specific group', async () => {
      process.env.RUNNER_LABELS = 'label1,label2';
      process.env.RUNNER_GROUP_NAME = 'TEST_GROUP';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('creates a runner with ami id override from ssm parameter', async () => {
      process.env.AMI_ID_SSM_PARAMETER_NAME = 'my-ami-id-param';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(createRunner).toBeCalledWith({ ...expectedRunnerParams, amiIdSsmParameterName: 'my-ami-id-param' });
    });

    it('Throws an error if runner group does not exist for ephemeral runners', async () => {
      process.env.RUNNER_GROUP_NAME = 'test-runner-group';
      mockSSMgetParameter.mockImplementation(async () => {
        throw new Error('ParameterNotFound');
      });
      await expect(scaleUpModule.scaleUp(TEST_DATA)).rejects.toBeInstanceOf(Error);
      expect(mockOctokit.paginate).toHaveBeenCalledTimes(1);
    });

    it('Discards event if it is a User repo and org level runners is enabled', async () => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
      const USER_REPO_TEST_DATA = structuredClone(TEST_DATA);
      USER_REPO_TEST_DATA[0].repoOwnerType = 'User';
      await scaleUpModule.scaleUp(USER_REPO_TEST_DATA);
      expect(createRunner).not.toHaveBeenCalled();
    });

    it('create SSM parameter for runner group id if it does not exist', async () => {
      mockSSMgetParameter.mockImplementation(async () => {
        throw new Error('ParameterNotFound');
      });
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.paginate).toHaveBeenCalledTimes(1);
      expect(mockSSMClient).toHaveReceivedCommandTimes(PutParameterCommand, 2);
      expect(mockSSMClient).toHaveReceivedNthSpecificCommandWith(1, PutParameterCommand, {
        Name: `${process.env.SSM_CONFIG_PATH}/runner-group/${process.env.RUNNER_GROUP_NAME}`,
        Value: '1',
        Type: 'String',
      });
    });

    it('Does not create SSM parameter for runner group id if it exists', async () => {
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.paginate).toHaveBeenCalledTimes(0);
      expect(mockSSMClient).toHaveReceivedCommandTimes(PutParameterCommand, 1);
    });

    it('create start runner config for ephemeral runners ', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '2';

      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.actions.generateRunnerJitconfigForOrg).toBeCalledWith({
        org: TEST_DATA_SINGLE.repositoryOwner,
        name: 'unit-test-i-12345',
        runner_group_id: 1,
        labels: ['label1', 'label2'],
      });
      expect(mockSSMClient).toHaveReceivedNthSpecificCommandWith(1, PutParameterCommand, {
        Name: '/github-action-runners/default/runners/config/i-12345',
        Value: 'TEST_JIT_CONFIG_ORG',
        Type: 'SecureString',
        Tags: [
          {
            Key: 'InstanceId',
            Value: 'i-12345',
          },
        ],
      });
    });

    it('create start runner config for non-ephemeral runners ', async () => {
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'false';
      process.env.RUNNERS_MAXIMUM_COUNT = '2';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.actions.generateRunnerJitconfigForOrg).not.toBeCalled();
      expect(mockOctokit.actions.createRegistrationTokenForOrg).toBeCalled();
      expect(mockSSMClient).toHaveReceivedNthSpecificCommandWith(1, PutParameterCommand, {
        Name: '/github-action-runners/default/runners/config/i-12345',
        Value:
          '--url https://companyname.ghe.com/Codertocat --token 1234abcd ' +
          '--labels label1,label2 --runnergroup Default',
        Type: 'SecureString',
        Tags: [
          {
            Key: 'InstanceId',
            Value: 'i-12345',
          },
        ],
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
        await scaleUpModule.scaleUp(TEST_DATA);
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
      expectedRunnerParams.runnerOwner = `${TEST_DATA_SINGLE.repositoryOwner}/${TEST_DATA_SINGLE.repositoryName}`;
      //   `--url https://companyname.ghe.com${TEST_DATA_SINGLE.repositoryOwner}/${TEST_DATA_SINGLE.repositoryName}`,
      //   `--token 1234abcd`,
      // ];
    });

    it('gets the current repo level runners', async () => {
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(listEC2Runners).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerType: 'Repo',
        runnerOwner: `${TEST_DATA_SINGLE.repositoryOwner}/${TEST_DATA_SINGLE.repositoryName}`,
      });
    });

    it('does not create a token when maximum runners has been reached', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).not.toBeCalled();
      expect(mockOctokit.actions.createRegistrationTokenForRepo).not.toBeCalled();
    });

    it('creates a token when maximum runners has not been reached', async () => {
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'false';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).not.toBeCalled();
      expect(mockOctokit.actions.createRegistrationTokenForRepo).toBeCalledWith({
        owner: TEST_DATA_SINGLE.repositoryOwner,
        repo: TEST_DATA_SINGLE.repositoryName,
      });
    });

    it('uses the default runner max count', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = undefined;
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForRepo).toBeCalledWith({
        owner: TEST_DATA_SINGLE.repositoryOwner,
        repo: TEST_DATA_SINGLE.repositoryName,
      });
    });

    it('creates a runner with correct config and labels', async () => {
      process.env.RUNNER_LABELS = 'label1,label2';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('creates a runner and ensure the group argument is ignored', async () => {
      process.env.RUNNER_LABELS = 'label1,label2';
      process.env.RUNNER_GROUP_NAME = 'TEST_GROUP_IGNORED';
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(createRunner).toBeCalledWith(expectedRunnerParams);
    });

    it('Check error is thrown', async () => {
      const mockCreateRunners = vi.mocked(createRunner);
      mockCreateRunners.mockRejectedValue(new Error('no retry'));
      await expect(scaleUpModule.scaleUp(TEST_DATA)).rejects.toThrow('no retry');
      mockCreateRunners.mockReset();
    });
  });

  describe('Batch processing', () => {
    const createTestMessages = (
      count: number,
      overrides: Partial<scaleUpModule.ActionRequestMessageSQS>[] = [],
    ): scaleUpModule.ActionRequestMessageSQS[] => {
      return Array.from({ length: count }, (_, i) => ({
        ...TEST_DATA_SINGLE,
        id: i + 1,
        messageId: `message-${i}`,
        ...overrides[i],
      }));
    };

    beforeEach(() => {
      setDefaults();
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'true';
      process.env.RUNNERS_MAXIMUM_COUNT = '10';
    });

    it('Should handle multiple messages for the same organization', async () => {
      const messages = createTestMessages(3);
      await scaleUpModule.scaleUp(messages);

      expect(createRunner).toHaveBeenCalledTimes(1);
      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 3,
          runnerOwner: TEST_DATA_SINGLE.repositoryOwner,
        }),
      );
    });

    it('Should handle multiple messages for different organizations', async () => {
      const messages = createTestMessages(3, [
        { repositoryOwner: 'org1' },
        { repositoryOwner: 'org2' },
        { repositoryOwner: 'org1' },
      ]);

      await scaleUpModule.scaleUp(messages);

      expect(createRunner).toHaveBeenCalledTimes(2);
      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 2,
          runnerOwner: 'org1',
        }),
      );
      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 1,
          runnerOwner: 'org2',
        }),
      );
    });

    it('Should handle multiple messages for different repositories when org-level is disabled', async () => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
      const messages = createTestMessages(3, [
        { repositoryOwner: 'owner1', repositoryName: 'repo1' },
        { repositoryOwner: 'owner1', repositoryName: 'repo2' },
        { repositoryOwner: 'owner1', repositoryName: 'repo1' },
      ]);

      await scaleUpModule.scaleUp(messages);

      expect(createRunner).toHaveBeenCalledTimes(2);
      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 2,
          runnerOwner: 'owner1/repo1',
        }),
      );
      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 1,
          runnerOwner: 'owner1/repo2',
        }),
      );
    });

    it('Should reject messages when maximum runners limit is reached', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '2';
      mockListRunners.mockImplementation(async () => [
        {
          instanceId: 'i-existing',
          launchTime: new Date(),
          type: 'Org',
          owner: TEST_DATA_SINGLE.repositoryOwner,
        },
      ]);

      const messages = createTestMessages(5);
      const rejectedMessages = await scaleUpModule.scaleUp(messages);

      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 1, // 2 max - 1 existing = 1 new
        }),
      );
      expect(rejectedMessages).toHaveLength(4); // 5 requested - 1 created = 4 rejected
    });

    it('Should handle partial EC2 instance creation failures', async () => {
      mockCreateRunner.mockImplementation(async () => ['i-12345']); // Only creates 1 instead of requested 3

      const messages = createTestMessages(3);
      const rejectedMessages = await scaleUpModule.scaleUp(messages);

      expect(rejectedMessages).toHaveLength(2); // 3 requested - 1 created = 2 failed
      expect(rejectedMessages).toEqual(['message-0', 'message-1']);
    });

    it('Should filter out invalid event types for ephemeral runners', async () => {
      const messages = createTestMessages(3, [
        { eventType: 'workflow_job' },
        { eventType: 'check_run' },
        { eventType: 'workflow_job' },
      ]);

      const rejectedMessages = await scaleUpModule.scaleUp(messages);

      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 2, // Only workflow_job events processed
        }),
      );
      expect(rejectedMessages).toContain('message-1'); // check_run event rejected
    });

    it('Should skip invalid repo owner types but not reject them', async () => {
      const messages = createTestMessages(3, [
        { repoOwnerType: 'Organization' },
        { repoOwnerType: 'User' }, // Invalid for org-level runners
        { repoOwnerType: 'Organization' },
      ]);

      const rejectedMessages = await scaleUpModule.scaleUp(messages);

      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 2, // Only Organization events processed
        }),
      );
      expect(rejectedMessages).not.toContain('message-1'); // User repo not rejected, just skipped
    });

    it('Should skip messages when jobs are not queued', async () => {
      mockOctokit.actions.getJobForWorkflowRun.mockImplementation((params) => {
        const isQueued = params.job_id === 1 || params.job_id === 3; // Only jobs 1 and 3 are queued
        return {
          data: {
            status: isQueued ? 'queued' : 'completed',
          },
        };
      });

      const messages = createTestMessages(3);
      await scaleUpModule.scaleUp(messages);

      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 2, // Only queued jobs processed
        }),
      );
    });

    it('Should create separate GitHub clients for different installations', async () => {
      mockOctokit.apps.getOrgInstallation.mockImplementation((params) => ({
        data: {
          id: params.org === 'org1' ? 100 : 200,
        },
      }));

      const messages = createTestMessages(2, [
        { repositoryOwner: 'org1', installationId: 0 },
        { repositoryOwner: 'org2', installationId: 0 },
      ]);

      await scaleUpModule.scaleUp(messages);

      expect(mockCreateClient).toHaveBeenCalledTimes(3); // 1 app client, 2 repo installation clients
      expect(mockedInstallationAuth).toHaveBeenCalledWith(100, '');
      expect(mockedInstallationAuth).toHaveBeenCalledWith(200, '');
    });

    it('Should reuse GitHub clients for same installation', async () => {
      const messages = createTestMessages(3, [
        { repositoryOwner: 'same-org' },
        { repositoryOwner: 'same-org' },
        { repositoryOwner: 'same-org' },
      ]);

      await scaleUpModule.scaleUp(messages);

      expect(mockCreateClient).toHaveBeenCalledTimes(2); // 1 app client, 1 installation client
      expect(mockedInstallationAuth).toHaveBeenCalledTimes(1);
    });

    it('Should return empty array when no valid messages to process', async () => {
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'true';
      const messages = createTestMessages(2, [
        { eventType: 'check_run' }, // Invalid for ephemeral
        { eventType: 'check_run' }, // Invalid for ephemeral
      ]);

      const rejectedMessages = await scaleUpModule.scaleUp(messages);

      expect(createRunner).not.toHaveBeenCalled();
      expect(rejectedMessages).toEqual(['message-0', 'message-1']);
    });

    it('Should handle unlimited runners configuration', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '-1';
      const messages = createTestMessages(10);

      await scaleUpModule.scaleUp(messages);

      expect(listEC2Runners).not.toHaveBeenCalled(); // No need to check current runners
      expect(createRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          numberOfRunners: 10, // All messages processed
        }),
      );
    });
  });
});

function defaultOctokitMockImpl() {
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
      runner: { id: 9876543210 },
      encoded_jit_config: 'TEST_JIT_CONFIG_ORG',
    },
  }));
  mockOctokit.actions.generateRunnerJitconfigForRepo.mockImplementation(() => ({
    data: {
      runner: { id: 9876543210 },
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
      id: TEST_DATA_SINGLE.installationId,
    },
  };
  const mockInstallationIdReturnValueRepos = {
    data: {
      id: TEST_DATA_SINGLE.installationId,
    },
  };

  mockOctokit.actions.createRegistrationTokenForOrg.mockImplementation(() => mockTokenReturnValue);
  mockOctokit.actions.createRegistrationTokenForRepo.mockImplementation(() => mockTokenReturnValue);
  mockOctokit.apps.getOrgInstallation.mockImplementation(() => mockInstallationIdReturnValueOrgs);
  mockOctokit.apps.getRepoInstallation.mockImplementation(() => mockInstallationIdReturnValueRepos);
}

function defaultSSMGetParameterMockImpl() {
  mockSSMgetParameter.mockImplementation(async (name: string) => {
    if (name === `${process.env.SSM_CONFIG_PATH}/runner-group/${process.env.RUNNER_GROUP_NAME}`) {
      return '1';
    } else if (name === `${process.env.PARAMETER_GITHUB_APP_ID_NAME}`) {
      return `${process.env.GITHUB_APP_ID}`;
    } else {
      throw new Error(`ParameterNotFound: ${name}`);
    }
  });
}
