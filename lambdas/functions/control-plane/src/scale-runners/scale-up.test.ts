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
import { publishRetryMessage } from './job-retry';
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
const mockPublishRetryMessage = vi.mocked(publishRetryMessage);

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

vi.mock('./job-retry', () => ({
  publishRetryMessage: vi.fn(),
  checkAndRetryJob: vi.fn(),
}));

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
  scaleErrors: ['UnfulfillableCapacity', 'MaxSpotInstanceCountExceeded', 'TargetCapacityLimitExceededException'],
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
  process.env.SCALE_ERRORS =
    '["UnfulfillableCapacity","MaxSpotInstanceCountExceeded","TargetCapacityLimitExceededException"]';
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

  describe('Dynamic EC2 Configuration', () => {
    beforeEach(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
      process.env.ENABLE_DYNAMIC_LABELS = 'true';
      process.env.ENABLE_EPHEMERAL_RUNNERS = 'true';
      process.env.ENABLE_JOB_QUEUED_CHECK = 'false';
      process.env.RUNNER_LABELS = 'base-label';
      process.env.INSTANCE_TYPES = 't3.medium,t3.large';
      process.env.RUNNER_NAME_PREFIX = 'unit-test';
      expectedRunnerParams = { ...EXPECTED_RUNNER_PARAMS };
      mockSSMClient.reset();
    });

    it('appends EC2 labels to existing runner labels when EC2 labels are present', async () => {
      const testDataWithEc2Labels = [
        {
          ...TEST_DATA_SINGLE,
          labels: ['ghr-ec2-instance-type:c5.2xlarge', 'ghr-ec2-custom:value'],
          messageId: 'test-1',
        },
      ];

      await scaleUpModule.scaleUp(testDataWithEc2Labels);

      // Verify createRunner was called with EC2 instance type in override config
      expect(createRunner).toBeCalledWith(
        expect.objectContaining({
          ec2instanceCriteria: expect.objectContaining({
            instanceTypes: ['t3.medium', 't3.large'],
          }),
          ec2OverrideConfig: expect.objectContaining({
            InstanceType: 'c5.2xlarge',
          }),
        }),
      );
    });

    it('uses default instance types when no instance type EC2 label is provided', async () => {
      const testDataWithEc2Labels = [
        {
          ...TEST_DATA_SINGLE,
          labels: ['ghr-ec2-custom:value'],
          messageId: 'test-3',
        },
      ];

      await scaleUpModule.scaleUp(testDataWithEc2Labels);

      // Should use the default INSTANCE_TYPES from environment
      expect(createRunner).toBeCalledWith(
        expect.objectContaining({
          ec2instanceCriteria: expect.objectContaining({
            instanceTypes: ['t3.medium', 't3.large'],
          }),
        }),
      );
    });

    it('handles messages with no labels gracefully', async () => {
      const testDataWithNoLabels = [
        {
          ...TEST_DATA_SINGLE,
          labels: undefined,
          messageId: 'test-5',
        },
      ];

      await scaleUpModule.scaleUp(testDataWithNoLabels);

      expect(createRunner).toBeCalledWith(
        expect.objectContaining({
          ec2instanceCriteria: expect.objectContaining({
            instanceTypes: ['t3.medium', 't3.large'],
          }),
        }),
      );
    });

    it('handles empty labels array', async () => {
      const testDataWithEmptyLabels = [
        {
          ...TEST_DATA_SINGLE,
          labels: [],
          messageId: 'test-6',
        },
      ];

      await scaleUpModule.scaleUp(testDataWithEmptyLabels);

      expect(createRunner).toBeCalledWith(
        expect.objectContaining({
          ec2instanceCriteria: expect.objectContaining({
            instanceTypes: ['t3.medium', 't3.large'],
          }),
        }),
      );
    });

    it('does not process EC2 labels when ENABLE_DYNAMIC_LABELS is disabled', async () => {
      process.env.ENABLE_DYNAMIC_LABELS = 'false';

      const testDataWithEc2Labels = [
        {
          ...TEST_DATA_SINGLE,
          labels: ['ghr-ec2-instance-type:c5.4xlarge'],
          messageId: 'test-7',
        },
      ];

      await scaleUpModule.scaleUp(testDataWithEc2Labels);

      // Should ignore EC2 labels and use default instance types
      expect(createRunner).toBeCalledWith(
        expect.objectContaining({
          ec2instanceCriteria: expect.objectContaining({
            instanceTypes: ['t3.medium', 't3.large'],
          }),
        }),
      );
    });

    it('handles multiple EC2 labels correctly', async () => {
      const testDataWithMultipleEc2Labels = [
        {
          ...TEST_DATA_SINGLE,
          labels: ['regular-label', 'ghr-ec2-instance-type:r5.2xlarge', 'ghr-ec2-ami:custom-ami', 'ghr-ec2-disk:200'],
          messageId: 'test-8',
        },
      ];

      await scaleUpModule.scaleUp(testDataWithMultipleEc2Labels);

      expect(createRunner).toBeCalledWith(
        expect.objectContaining({
          ec2instanceCriteria: expect.objectContaining({
            instanceTypes: ['t3.medium', 't3.large'],
          }),
          ec2OverrideConfig: expect.objectContaining({
            InstanceType: 'r5.2xlarge',
          }),
        }),
      );
    });

    it('includes ec2OverrideConfig with VCpuCount requirements when specified', async () => {
      const testDataWithVCpuLabels = [
        {
          ...TEST_DATA_SINGLE,
          labels: ['self-hosted', 'ghr-ec2-vcpu-count-min:4', 'ghr-ec2-vcpu-count-max:16'],
          messageId: 'test-9',
        },
      ];

      await scaleUpModule.scaleUp(testDataWithVCpuLabels);

      expect(createRunner).toBeCalledWith(
        expect.objectContaining({
          ec2OverrideConfig: expect.objectContaining({
            InstanceRequirements: expect.objectContaining({
              VCpuCount: {
                Min: 4,
                Max: 16,
              },
            }),
          }),
        }),
      );
    });

    it('includes ec2OverrideConfig with MemoryMiB requirements when specified', async () => {
      const testDataWithMemoryLabels = [
        {
          ...TEST_DATA_SINGLE,
          labels: ['self-hosted', 'ghr-ec2-memory-mib-min:8192', 'ghr-ec2-memory-mib-max:32768'],
          messageId: 'test-10',
        },
      ];

      await scaleUpModule.scaleUp(testDataWithMemoryLabels);

      expect(createRunner).toBeCalledWith(
        expect.objectContaining({
          ec2OverrideConfig: expect.objectContaining({
            InstanceRequirements: expect.objectContaining({
              MemoryMiB: {
                Min: 8192,
                Max: 32768,
              },
            }),
          }),
        }),
      );
    });

    it('includes ec2OverrideConfig with CPU manufacturers when specified', async () => {
      const testDataWithCpuLabels = [
        {
          ...TEST_DATA_SINGLE,
          labels: ['self-hosted', 'ghr-ec2-cpu-manufacturers:intel,amd'],
          messageId: 'test-11',
        },
      ];

      await scaleUpModule.scaleUp(testDataWithCpuLabels);

      expect(createRunner).toBeCalledWith(
        expect.objectContaining({
          ec2OverrideConfig: expect.objectContaining({
            InstanceRequirements: expect.objectContaining({
              CpuManufacturers: ['intel', 'amd'],
            }),
          }),
        }),
      );
    });

    it('includes ec2OverrideConfig with instance generations when specified', async () => {
      const testDataWithGenerationLabels = [
        {
          ...TEST_DATA_SINGLE,
          labels: ['self-hosted', 'ghr-ec2-instance-generations:current'],
          messageId: 'test-12',
        },
      ];

      await scaleUpModule.scaleUp(testDataWithGenerationLabels);

      expect(createRunner).toBeCalledWith(
        expect.objectContaining({
          ec2OverrideConfig: expect.objectContaining({
            InstanceRequirements: expect.objectContaining({
              InstanceGenerations: ['current'],
            }),
          }),
        }),
      );
    });

    it('includes ec2OverrideConfig with accelerator requirements when specified', async () => {
      const testDataWithAcceleratorLabels = [
        {
          ...TEST_DATA_SINGLE,
          labels: ['self-hosted', 'ghr-ec2-accelerator-count-min:1', 'ghr-ec2-accelerator-types:gpu'],
          messageId: 'test-13',
        },
      ];

      await scaleUpModule.scaleUp(testDataWithAcceleratorLabels);

      expect(createRunner).toBeCalledWith(
        expect.objectContaining({
          ec2OverrideConfig: expect.objectContaining({
            InstanceRequirements: expect.objectContaining({
              AcceleratorCount: {
                Min: 1,
              },
              AcceleratorTypes: ['gpu'],
            }),
          }),
        }),
      );
    });

    it('includes ec2OverrideConfig with max price when specified', async () => {
      const testDataWithMaxPrice = [
        {
          ...TEST_DATA_SINGLE,
          labels: ['self-hosted', 'ghr-ec2-max-price:0.50'],
          messageId: 'test-14',
        },
      ];

      await scaleUpModule.scaleUp(testDataWithMaxPrice);

      expect(createRunner).toBeCalledWith(
        expect.objectContaining({
          ec2OverrideConfig: expect.objectContaining({
            MaxPrice: '0.50',
          }),
        }),
      );
    });

    it('includes ec2OverrideConfig with priority and weighted capacity when specified', async () => {
      const testDataWithPriorityWeight = [
        {
          ...TEST_DATA_SINGLE,
          labels: ['self-hosted', 'ghr-ec2-priority:1', 'ghr-ec2-weighted-capacity:2'],
          messageId: 'test-15',
        },
      ];

      await scaleUpModule.scaleUp(testDataWithPriorityWeight);

      expect(createRunner).toBeCalledWith(
        expect.objectContaining({
          ec2OverrideConfig: expect.objectContaining({
            Priority: 1,
            WeightedCapacity: 2,
          }),
        }),
      );
    });

    it('includes ec2OverrideConfig with combined requirements', async () => {
      const testDataWithCombinedLabels = [
        {
          ...TEST_DATA_SINGLE,
          labels: [
            'self-hosted',
            'linux',
            'ghr-ec2-vcpu-count-min:8',
            'ghr-ec2-memory-mib-min:16384',
            'ghr-ec2-cpu-manufacturers:intel',
            'ghr-ec2-instance-generations:current',
            'ghr-ec2-max-price:1.00',
          ],
          messageId: 'test-16',
        },
      ];

      await scaleUpModule.scaleUp(testDataWithCombinedLabels);

      expect(createRunner).toBeCalledWith(
        expect.objectContaining({
          ec2OverrideConfig: expect.objectContaining({
            InstanceRequirements: expect.objectContaining({
              VCpuCount: { Min: 8 },
              MemoryMiB: { Min: 16384 },
              CpuManufacturers: ['intel'],
              InstanceGenerations: ['current'],
            }),
            MaxPrice: '1.00',
          }),
        }),
      );
    });

    it('includes both instance type and ec2OverrideConfig when both specified', async () => {
      const testDataWithBoth = [
        {
          ...TEST_DATA_SINGLE,
          labels: ['self-hosted', 'ghr-ec2-instance-type:c5.xlarge', 'ghr-ec2-vcpu-count-min:4'],
          messageId: 'test-18',
        },
      ];

      await scaleUpModule.scaleUp(testDataWithBoth);

      expect(createRunner).toBeCalledWith(
        expect.objectContaining({
          ec2instanceCriteria: expect.objectContaining({
            instanceTypes: ['t3.medium', 't3.large'],
          }),
          ec2OverrideConfig: expect.objectContaining({
            InstanceType: 'c5.xlarge',
            InstanceRequirements: expect.objectContaining({
              VCpuCount: { Min: 4 },
            }),
          }),
        }),
      );
    });
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

    it('creates a runner with correct config and labels and custom scale errors enabled.', async () => {
      process.env.RUNNER_LABELS = 'label1,label2';
      process.env.SCALE_ERRORS = JSON.stringify(['RequestLimitExceeded']);
      await scaleUpModule.scaleUp(TEST_DATA);
      expect(createRunner).toBeCalledWith({
        ...expectedRunnerParams,
        scaleErrors: ['RequestLimitExceeded'],
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

<<<<<<< HEAD
describe('Retry mechanism tests', () => {
  beforeEach(() => {
    process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
    process.env.ENABLE_EPHEMERAL_RUNNERS = 'true';
    process.env.ENABLE_JOB_QUEUED_CHECK = 'true';
    process.env.RUNNERS_MAXIMUM_COUNT = '10';
    expectedRunnerParams = { ...EXPECTED_RUNNER_PARAMS };
    mockSSMClient.reset();
  });

  const createTestMessages = (
    count: number,
    overrides: Partial<scaleUpModule.ActionRequestMessageSQS>[] = [],
  ): scaleUpModule.ActionRequestMessageSQS[] => {
    return Array.from({ length: count }, (_, i) => ({
      ...TEST_DATA_SINGLE,
      id: i + 1,
      messageId: `message-${i + 1}`,
      ...overrides[i],
    }));
  };

  it('calls publishRetryMessage for each valid message when job is queued', async () => {
    const messages = createTestMessages(3);
    mockCreateRunner.mockResolvedValue(['i-12345', 'i-67890', 'i-abcdef']); // Create all requested runners

    await scaleUpModule.scaleUp(messages);

    expect(mockPublishRetryMessage).toHaveBeenCalledTimes(3);
    expect(mockPublishRetryMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 1,
        messageId: 'message-1',
      }),
    );
    expect(mockPublishRetryMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: 2,
        messageId: 'message-2',
      }),
    );
    expect(mockPublishRetryMessage).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        id: 3,
        messageId: 'message-3',
      }),
    );
  });

  it('does not call publishRetryMessage when job is not queued', async () => {
    mockOctokit.actions.getJobForWorkflowRun.mockImplementation((params) => {
      const isQueued = params.job_id === 1; // Only job 1 is queued
      return {
        data: {
          status: isQueued ? 'queued' : 'completed',
        },
      };
    });

    const messages = createTestMessages(3);

    await scaleUpModule.scaleUp(messages);

    // Only message with id 1 should trigger retry
    expect(mockPublishRetryMessage).toHaveBeenCalledTimes(1);
    expect(mockPublishRetryMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        messageId: 'message-1',
      }),
    );
  });

  it('does not call publishRetryMessage when maximum runners is reached and messages are marked invalid', async () => {
    process.env.RUNNERS_MAXIMUM_COUNT = '0'; // No runners can be created

    const messages = createTestMessages(2);

    await scaleUpModule.scaleUp(messages);

    // Verify listEC2Runners is called to check current runner count
    expect(listEC2Runners).toHaveBeenCalledWith({
      environment: 'unit-test-environment',
      runnerType: 'Org',
      runnerOwner: TEST_DATA_SINGLE.repositoryOwner,
    });

    // publishRetryMessage should NOT be called because messages are marked as invalid
    // Invalid messages go back to the SQS queue and will be retried there
    expect(mockPublishRetryMessage).not.toHaveBeenCalled();
    expect(createRunner).not.toHaveBeenCalled();
  });

  it('calls publishRetryMessage with correct message structure including retry counter', async () => {
    const message = {
      ...TEST_DATA_SINGLE,
      messageId: 'test-message-id',
      retryCounter: 2,
    };

    await scaleUpModule.scaleUp([message]);

    expect(mockPublishRetryMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: message.id,
        messageId: 'test-message-id',
        retryCounter: 2,
      }),
    );
  });

  it('calls publishRetryMessage when ENABLE_JOB_QUEUED_CHECK is false', async () => {
    process.env.ENABLE_JOB_QUEUED_CHECK = 'false';
    mockCreateRunner.mockResolvedValue(['i-12345', 'i-67890']); // Create all requested runners

    const messages = createTestMessages(2);

    await scaleUpModule.scaleUp(messages);

    // Should always call publishRetryMessage when queue check is disabled
    expect(mockPublishRetryMessage).toHaveBeenCalledTimes(2);
    expect(mockOctokit.actions.getJobForWorkflowRun).not.toHaveBeenCalled();
  });

  it('calls publishRetryMessage for each message in a multi-runner scenario', async () => {
    mockCreateRunner.mockResolvedValue(['i-12345', 'i-67890', 'i-abcdef', 'i-11111', 'i-22222']); // Create all requested runners
    const messages = createTestMessages(5);

    await scaleUpModule.scaleUp(messages);

    expect(mockPublishRetryMessage).toHaveBeenCalledTimes(5);
    messages.forEach((msg, index) => {
      expect(mockPublishRetryMessage).toHaveBeenNthCalledWith(
        index + 1,
        expect.objectContaining({
          id: msg.id,
          messageId: msg.messageId,
        }),
=======
describe('parseEc2OverrideConfig', () => {
  describe('Basic Fleet Overrides', () => {
    it('should parse instance-type label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-instance-type:c5.xlarge']);
      expect(result?.InstanceType).toBe('c5.xlarge');
    });

    it('should parse subnet-id label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-subnet-id:subnet-123456']);
      expect(result?.SubnetId).toBe('subnet-123456');
    });

    it('should parse availability-zone label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-availability-zone:us-east-1a']);
      expect(result?.AvailabilityZone).toBe('us-east-1a');
    });

    it('should parse availability-zone-id label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-availability-zone-id:use1-az1']);
      expect(result?.AvailabilityZoneId).toBe('use1-az1');
    });

    it('should parse max-price label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-max-price:0.50']);
      expect(result?.MaxPrice).toBe('0.50');
    });

    it('should parse priority label as number', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-priority:1']);
      expect(result?.Priority).toBe(1);
    });

    it('should parse weighted-capacity label as number', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-weighted-capacity:2']);
      expect(result?.WeightedCapacity).toBe(2);
    });

    it('should parse image-id label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-image-id:ami-12345678']);
      expect(result?.ImageId).toBe('ami-12345678');
    });

    it('should parse multiple basic fleet overrides', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([
        'ghr-ec2-instance-type:r5.2xlarge',
        'ghr-ec2-max-price:1.00',
        'ghr-ec2-priority:2',
      ]);
      expect(result?.InstanceType).toBe('r5.2xlarge');
      expect(result?.MaxPrice).toBe('1.00');
      expect(result?.Priority).toBe(2);
    });
  });

  describe('Placement', () => {
    it('should parse placement-group label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-placement-group:my-placement-group']);
      expect(result?.Placement?.GroupName).toBe('my-placement-group');
    });

    it('should parse placement-tenancy label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-placement-tenancy:dedicated']);
      expect(result?.Placement?.Tenancy).toBe('dedicated');
    });

    it('should parse placement-host-id label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-placement-host-id:h-1234567890abcdef']);
      expect(result?.Placement?.HostId).toBe('h-1234567890abcdef');
    });

    it('should parse placement-affinity label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-placement-affinity:host']);
      expect(result?.Placement?.Affinity).toBe('host');
    });

    it('should parse placement-partition-number label as number', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-placement-partition-number:3']);
      expect(result?.Placement?.PartitionNumber).toBe(3);
    });

    it('should parse placement-availability-zone label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-placement-availability-zone:us-west-2b']);
      expect(result?.Placement?.AvailabilityZone).toBe('us-west-2b');
    });

    it('should parse placement-spread-domain label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-placement-spread-domain:my-spread-domain']);
      expect(result?.Placement?.SpreadDomain).toBe('my-spread-domain');
    });

    it('should parse placement-host-resource-group-arn label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([
        'ghr-ec2-placement-host-resource-group-arn:arn:aws:ec2:us-east-1:123456789012:host-resource-group/hrg-1234',
      ]);
      expect(result?.Placement?.HostResourceGroupArn).toBe(
        'arn:aws:ec2:us-east-1:123456789012:host-resource-group/hrg-1234',
      );
    });

    it('should parse multiple placement labels', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([
        'ghr-ec2-placement-group:group-1',
        'ghr-ec2-placement-tenancy:dedicated',
        'ghr-ec2-placement-availability-zone:us-east-1b',
      ]);
      expect(result?.Placement?.GroupName).toBe('group-1');
      expect(result?.Placement?.Tenancy).toBe('dedicated');
      expect(result?.Placement?.AvailabilityZone).toBe('us-east-1b');
    });
  });

  describe('Block Device Mappings', () => {
    it('should parse ebs-volume-size label as number', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-ebs-volume-size:100']);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.VolumeSize).toBe(100);
    });

    it('should parse ebs-volume-type label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-ebs-volume-type:gp3']);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.VolumeType).toBe('gp3');
    });

    it('should parse ebs-iops label as number', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-ebs-iops:3000']);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.Iops).toBe(3000);
    });

    it('should parse ebs-throughput label as number', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-ebs-throughput:250']);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.Throughput).toBe(250);
    });

    it('should parse ebs-encrypted label as boolean true', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-ebs-encrypted:true']);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.Encrypted).toBe(true);
    });

    it('should parse ebs-encrypted label as boolean false', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-ebs-encrypted:false']);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.Encrypted).toBe(false);
    });

    it('should parse ebs-kms-key-id label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([
        'ghr-ec2-ebs-kms-key-id:arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
      ]);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.KmsKeyId).toBe(
        'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
      );
    });

    it('should parse ebs-delete-on-termination label as boolean true', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-ebs-delete-on-termination:true']);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.DeleteOnTermination).toBe(true);
    });

    it('should parse ebs-delete-on-termination label as boolean false', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-ebs-delete-on-termination:false']);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.DeleteOnTermination).toBe(false);
    });

    it('should parse ebs-snapshot-id label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-ebs-snapshot-id:snap-1234567890abcdef']);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.SnapshotId).toBe('snap-1234567890abcdef');
    });

    it('should parse block-device-virtual-name label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-block-device-virtual-name:ephemeral0']);
      expect(result?.BlockDeviceMappings?.[0]?.VirtualName).toBe('ephemeral0');
    });

    it('should parse block-device-no-device label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-block-device-no-device:true']);
      expect(result?.BlockDeviceMappings?.[0]?.NoDevice).toBe('true');
    });

    it('should parse multiple block device mapping labels', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([
        'ghr-ec2-ebs-volume-size:200',
        'ghr-ec2-ebs-volume-type:gp3',
        'ghr-ec2-ebs-iops:5000',
        'ghr-ec2-ebs-encrypted:true',
      ]);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.VolumeSize).toBe(200);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.VolumeType).toBe('gp3');
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.Iops).toBe(5000);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.Encrypted).toBe(true);
    });

    it('should initialize BlockDeviceMappings when not present', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-ebs-volume-size:50']);
      expect(result?.BlockDeviceMappings).toBeDefined();
      // expect(result?.BlockDeviceMappings?.[0]?.DeviceName).toBe('/dev/sda1');
    });
  });

  describe('Instance Requirements - vCPU and Memory', () => {
    it('should parse vcpu-count-min label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-vcpu-count-min:4']);
      expect(result?.InstanceRequirements?.VCpuCount?.Min).toBe(4);
    });

    it('should parse vcpu-count-max label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-vcpu-count-max:16']);
      expect(result?.InstanceRequirements?.VCpuCount?.Max).toBe(16);
    });

    it('should parse both vcpu-count-min and vcpu-count-max labels', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-vcpu-count-min:2', 'ghr-ec2-vcpu-count-max:8']);
      expect(result?.InstanceRequirements?.VCpuCount?.Min).toBe(2);
      expect(result?.InstanceRequirements?.VCpuCount?.Max).toBe(8);
    });

    it('should parse memory-mib-min label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-memory-mib-min:8192']);
      expect(result?.InstanceRequirements?.MemoryMiB?.Min).toBe(8192);
    });

    it('should parse memory-mib-max label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-memory-mib-max:32768']);
      expect(result?.InstanceRequirements?.MemoryMiB?.Max).toBe(32768);
    });

    it('should parse both memory-mib-min and memory-mib-max labels', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([
        'ghr-ec2-memory-mib-min:16384',
        'ghr-ec2-memory-mib-max:65536',
      ]);
      expect(result?.InstanceRequirements?.MemoryMiB?.Min).toBe(16384);
      expect(result?.InstanceRequirements?.MemoryMiB?.Max).toBe(65536);
    });

    it('should parse memory-gib-per-vcpu-min label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-memory-gib-per-vcpu-min:2']);
      expect(result?.InstanceRequirements?.MemoryGiBPerVCpu?.Min).toBe(2);
    });

    it('should parse memory-gib-per-vcpu-max label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-memory-gib-per-vcpu-max:8']);
      expect(result?.InstanceRequirements?.MemoryGiBPerVCpu?.Max).toBe(8);
    });

    it('should parse combined vCPU and memory requirements', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([
        'ghr-ec2-vcpu-count-min:8',
        'ghr-ec2-vcpu-count-max:32',
        'ghr-ec2-memory-mib-min:32768',
        'ghr-ec2-memory-mib-max:131072',
      ]);
      expect(result?.InstanceRequirements?.VCpuCount?.Min).toBe(8);
      expect(result?.InstanceRequirements?.VCpuCount?.Max).toBe(32);
      expect(result?.InstanceRequirements?.MemoryMiB?.Min).toBe(32768);
      expect(result?.InstanceRequirements?.MemoryMiB?.Max).toBe(131072);
    });
  });

  describe('Instance Requirements - CPU and Performance', () => {
    it('should parse cpu-manufacturers as single value', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-cpu-manufacturers:intel']);
      expect(result?.InstanceRequirements?.CpuManufacturers).toEqual(['intel']);
    });

    it('should parse cpu-manufacturers as comma-separated list', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-cpu-manufacturers:intel,amd']);
      expect(result?.InstanceRequirements?.CpuManufacturers).toEqual(['intel', 'amd']);
    });

    it('should parse instance-generations as single value', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-instance-generations:current']);
      expect(result?.InstanceRequirements?.InstanceGenerations).toEqual(['current']);
    });

    it('should parse instance-generations as comma-separated list', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-instance-generations:current,previous']);
      expect(result?.InstanceRequirements?.InstanceGenerations).toEqual(['current', 'previous']);
    });

    it('should parse excluded-instance-types as single value', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-excluded-instance-types:t2.micro']);
      expect(result?.InstanceRequirements?.ExcludedInstanceTypes).toEqual(['t2.micro']);
    });

    it('should parse excluded-instance-types as comma-separated list', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-excluded-instance-types:t2.micro,t2.small']);
      expect(result?.InstanceRequirements?.ExcludedInstanceTypes).toEqual(['t2.micro', 't2.small']);
    });

    it('should parse allowed-instance-types as single value', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-allowed-instance-types:c5.xlarge']);
      expect(result?.InstanceRequirements?.AllowedInstanceTypes).toEqual(['c5.xlarge']);
    });

    it('should parse allowed-instance-types as comma-separated list', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-allowed-instance-types:c5.xlarge,c5.2xlarge']);
      expect(result?.InstanceRequirements?.AllowedInstanceTypes).toEqual(['c5.xlarge', 'c5.2xlarge']);
    });

    it('should parse burstable-performance label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-burstable-performance:included']);
      expect(result?.InstanceRequirements?.BurstablePerformance).toBe('included');
    });

    it('should parse bare-metal label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-bare-metal:excluded']);
      expect(result?.InstanceRequirements?.BareMetal).toBe('excluded');
    });
  });

  describe('Instance Requirements - Accelerators', () => {
    it('should parse accelerator-count-min label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-accelerator-count-min:1']);
      expect(result?.InstanceRequirements?.AcceleratorCount?.Min).toBe(1);
    });

    it('should parse accelerator-count-max label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-accelerator-count-max:4']);
      expect(result?.InstanceRequirements?.AcceleratorCount?.Max).toBe(4);
    });

    it('should parse both accelerator-count-min and accelerator-count-max', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([
        'ghr-ec2-accelerator-count-min:1',
        'ghr-ec2-accelerator-count-max:2',
      ]);
      expect(result?.InstanceRequirements?.AcceleratorCount?.Min).toBe(1);
      expect(result?.InstanceRequirements?.AcceleratorCount?.Max).toBe(2);
    });

    it('should parse accelerator-types as single value', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-accelerator-types:gpu']);
      expect(result?.InstanceRequirements?.AcceleratorTypes).toEqual(['gpu']);
    });

    it('should parse accelerator-types as comma-separated list', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-accelerator-types:gpu,fpga']);
      expect(result?.InstanceRequirements?.AcceleratorTypes).toEqual(['gpu', 'fpga']);
    });

    it('should parse accelerator-manufacturers as single value', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-accelerator-manufacturers:nvidia']);
      expect(result?.InstanceRequirements?.AcceleratorManufacturers).toEqual(['nvidia']);
    });

    it('should parse accelerator-manufacturers as comma-separated list', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-accelerator-manufacturers:nvidia,amd']);
      expect(result?.InstanceRequirements?.AcceleratorManufacturers).toEqual(['nvidia', 'amd']);
    });

    it('should parse accelerator-names as single value', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-accelerator-names:a100']);
      expect(result?.InstanceRequirements?.AcceleratorNames).toEqual(['a100']);
    });

    it('should parse accelerator-names as comma-separated list', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-accelerator-names:a100,v100']);
      expect(result?.InstanceRequirements?.AcceleratorNames).toEqual(['a100', 'v100']);
    });

    it('should parse accelerator-total-memory-mib-min label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-accelerator-total-memory-mib-min:8192']);
      expect(result?.InstanceRequirements?.AcceleratorTotalMemoryMiB?.Min).toBe(8192);
    });

    it('should parse accelerator-total-memory-mib-max label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-accelerator-total-memory-mib-max:40960']);
      expect(result?.InstanceRequirements?.AcceleratorTotalMemoryMiB?.Max).toBe(40960);
    });

    it('should parse combined accelerator requirements', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([
        'ghr-ec2-accelerator-count-min:1',
        'ghr-ec2-accelerator-count-max:2',
        'ghr-ec2-accelerator-types:gpu',
        'ghr-ec2-accelerator-manufacturers:nvidia',
      ]);
      expect(result?.InstanceRequirements?.AcceleratorCount?.Min).toBe(1);
      expect(result?.InstanceRequirements?.AcceleratorCount?.Max).toBe(2);
      expect(result?.InstanceRequirements?.AcceleratorTypes).toEqual(['gpu']);
      expect(result?.InstanceRequirements?.AcceleratorManufacturers).toEqual(['nvidia']);
    });
  });

  describe('Instance Requirements - Network and Storage', () => {
    it('should parse network-interface-count-min label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-network-interface-count-min:2']);
      expect(result?.InstanceRequirements?.NetworkInterfaceCount?.Min).toBe(2);
    });

    it('should parse network-interface-count-max label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-network-interface-count-max:4']);
      expect(result?.InstanceRequirements?.NetworkInterfaceCount?.Max).toBe(4);
    });

    it('should parse network-bandwidth-gbps-min label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-network-bandwidth-gbps-min:5']);
      expect(result?.InstanceRequirements?.NetworkBandwidthGbps?.Min).toBe(5);
    });

    it('should parse network-bandwidth-gbps-max label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-network-bandwidth-gbps-max:25']);
      expect(result?.InstanceRequirements?.NetworkBandwidthGbps?.Max).toBe(25);
    });

    it('should parse local-storage label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-local-storage:included']);
      expect(result?.InstanceRequirements?.LocalStorage).toBe('included');
    });

    it('should parse local-storage-types as single value', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-local-storage-types:ssd']);
      expect(result?.InstanceRequirements?.LocalStorageTypes).toEqual(['ssd']);
    });

    it('should parse local-storage-types as comma-separated list', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-local-storage-types:hdd,ssd']);
      expect(result?.InstanceRequirements?.LocalStorageTypes).toEqual(['hdd', 'ssd']);
    });

    it('should parse total-local-storage-gb-min label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-total-local-storage-gb-min:100']);
      expect(result?.InstanceRequirements?.TotalLocalStorageGB?.Min).toBe(100);
    });

    it('should parse total-local-storage-gb-max label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-total-local-storage-gb-max:1000']);
      expect(result?.InstanceRequirements?.TotalLocalStorageGB?.Max).toBe(1000);
    });

    it('should parse baseline-ebs-bandwidth-mbps-min label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-baseline-ebs-bandwidth-mbps-min:500']);
      expect(result?.InstanceRequirements?.BaselineEbsBandwidthMbps?.Min).toBe(500);
    });

    it('should parse baseline-ebs-bandwidth-mbps-max label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-baseline-ebs-bandwidth-mbps-max:2000']);
      expect(result?.InstanceRequirements?.BaselineEbsBandwidthMbps?.Max).toBe(2000);
    });
  });

  describe('Instance Requirements - Pricing and Other', () => {
    it('should parse spot-max-price-percentage-over-lowest-price label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-spot-max-price-percentage-over-lowest-price:50']);
      expect(result?.InstanceRequirements?.SpotMaxPricePercentageOverLowestPrice).toBe(50);
    });

    it('should parse on-demand-max-price-percentage-over-lowest-price label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([
        'ghr-ec2-on-demand-max-price-percentage-over-lowest-price:75',
      ]);
      expect(result?.InstanceRequirements?.OnDemandMaxPricePercentageOverLowestPrice).toBe(75);
    });

    it('should parse max-spot-price-as-percentage-of-optimal-on-demand-price label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([
        'ghr-ec2-max-spot-price-as-percentage-of-optimal-on-demand-price:60',
      ]);
      expect(result?.InstanceRequirements?.MaxSpotPriceAsPercentageOfOptimalOnDemandPrice).toBe(60);
    });

    it('should parse require-hibernate-support label as boolean true', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-require-hibernate-support:true']);
      expect(result?.InstanceRequirements?.RequireHibernateSupport).toBe(true);
    });

    it('should parse require-hibernate-support label as boolean false', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-require-hibernate-support:false']);
      expect(result?.InstanceRequirements?.RequireHibernateSupport).toBe(false);
    });

    it('should parse require-encryption-in-transit label as boolean true', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-require-encryption-in-transit:true']);
      expect(result?.InstanceRequirements?.RequireEncryptionInTransit).toBe(true);
    });

    it('should parse require-encryption-in-transit label as boolean false', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-require-encryption-in-transit:false']);
      expect(result?.InstanceRequirements?.RequireEncryptionInTransit).toBe(false);
    });

    it('should parse baseline-performance-factors-cpu-reference-families label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([
        'ghr-ec2-baseline-performance-factors-cpu-reference-families:intel',
      ]);
      expect(result?.InstanceRequirements?.BaselinePerformanceFactors?.Cpu?.References?.[0]?.InstanceFamily).toBe(
        'intel',
      );
    });
    it('should parse baseline-performance-factors-cpu-reference-families list label', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([
        'ghr-ec2-baseline-performance-factors-cpu-reference-families:intel,amd',
      ]);
      expect(result?.InstanceRequirements?.BaselinePerformanceFactors?.Cpu?.References?.[0]?.InstanceFamily).toBe(
        'intel',
      );
      expect(result?.InstanceRequirements?.BaselinePerformanceFactors?.Cpu?.References?.[1]?.InstanceFamily).toBe(
        'amd',
>>>>>>> 44df86d7 (test: fix test cases)
      );
    });
  });

<<<<<<< HEAD
  it('calls publishRetryMessage after runner creation', async () => {
    const messages = createTestMessages(1);
    mockCreateRunner.mockResolvedValue(['i-12345']); // Create the requested runner

    const callOrder: string[] = [];
    mockPublishRetryMessage.mockImplementation(() => {
      callOrder.push('publishRetryMessage');
      return Promise.resolve();
    });
    mockCreateRunner.mockImplementation(async () => {
      callOrder.push('createRunner');
      return ['i-12345'];
    });

    await scaleUpModule.scaleUp(messages);

    expect(callOrder).toEqual(['createRunner', 'publishRetryMessage']);
=======
  describe('Edge Cases', () => {
    it('should return undefined when empty array is provided', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([]);
      expect(result).toBeUndefined();
    });

    it('should return undefined when no ghr-ec2 labels are provided', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['self-hosted', 'linux', 'x64']);
      expect(result).toBeUndefined();
    });

    it('should ignore non-ghr-ec2 labels and only parse ghr-ec2 labels', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([
        'self-hosted',
        'ghr-ec2-instance-type:m5.large',
        'linux',
        'ghr-ec2-max-price:0.30',
      ]);
      expect(result?.InstanceType).toBe('m5.large');
      expect(result?.MaxPrice).toBe('0.30');
    });

    it('should handle labels with colons in values (ARNs)', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([
        'ghr-ec2-ebs-kms-key-id:arn:aws:kms:us-east-1:123456789012:key/abc-def-ghi',
      ]);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.KmsKeyId).toBe(
        'arn:aws:kms:us-east-1:123456789012:key/abc-def-ghi',
      );
    });

    it('should handle labels with colons in placement ARNs', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([
        'ghr-ec2-placement-host-resource-group-arn:arn:aws:ec2:us-west-2:123456789012:host-resource-group/hrg-abc123',
      ]);
      expect(result?.Placement?.HostResourceGroupArn).toBe(
        'arn:aws:ec2:us-west-2:123456789012:host-resource-group/hrg-abc123',
      );
    });

    it('should handle labels without values gracefully', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-instance-type:', 'ghr-ec2-max-price:0.50']);
      expect(result?.InstanceType).toBeUndefined();
      expect(result?.MaxPrice).toBe('0.50');
    });

    it('should handle malformed labels (no colon) gracefully', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-instance-type-m5-large', 'ghr-ec2-max-price:0.50']);
      expect(result?.MaxPrice).toBe('0.50');
      expect(result?.InstanceType).toBeUndefined();
    });

    it('should handle numeric strings correctly for number fields', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([
        'ghr-ec2-priority:5',
        'ghr-ec2-weighted-capacity:10',
        'ghr-ec2-vcpu-count-min:4',
      ]);
      expect(result?.Priority).toBe(5);
      expect(result?.WeightedCapacity).toBe(10);
      expect(result?.InstanceRequirements?.VCpuCount?.Min).toBe(4);
    });

    it('should handle boolean strings correctly for boolean fields', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([
        'ghr-ec2-ebs-encrypted:true',
        'ghr-ec2-ebs-delete-on-termination:false',
        'ghr-ec2-require-hibernate-support:true',
      ]);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.Encrypted).toBe(true);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.DeleteOnTermination).toBe(false);
      expect(result?.InstanceRequirements?.RequireHibernateSupport).toBe(true);
    });

    it('should handle floating point numbers in max-price', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-max-price:0.12345']);
      expect(result?.MaxPrice).toBe('0.12345');
    });

    it('should handle whitespace in comma-separated lists', () => {
      const result = scaleUpModule.parseEc2OverrideConfig(['ghr-ec2-cpu-manufacturers: intel , amd ']);
      expect(result?.InstanceRequirements?.CpuManufacturers).toEqual([' intel ', ' amd ']);
    });

    it('should return config with all parsed labels', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([
        'ghr-ec2-instance-type:c5.xlarge',
        'ghr-ec2-vcpu-count-min:4',
        'ghr-ec2-memory-mib-min:8192',
        'ghr-ec2-placement-tenancy:dedicated',
        'ghr-ec2-ebs-volume-size:100',
      ]);
      expect(result?.InstanceType).toBe('c5.xlarge');
      expect(result?.InstanceRequirements?.VCpuCount?.Min).toBe(4);
      expect(result?.InstanceRequirements?.MemoryMiB?.Min).toBe(8192);
      expect(result?.Placement?.Tenancy).toBe('dedicated');
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.VolumeSize).toBe(100);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle comprehensive EC2 configuration with all categories', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([
        // Basic Fleet
        'ghr-ec2-instance-type:r5.2xlarge',
        'ghr-ec2-max-price:0.75',
        'ghr-ec2-priority:1',
        // Placement
        'ghr-ec2-placement-group:my-group',
        'ghr-ec2-placement-tenancy:dedicated',
        // Block Device
        'ghr-ec2-ebs-volume-size:200',
        'ghr-ec2-ebs-volume-type:gp3',
        'ghr-ec2-ebs-encrypted:true',
        // Instance Requirements
        'ghr-ec2-vcpu-count-min:8',
        'ghr-ec2-vcpu-count-max:32',
        'ghr-ec2-memory-mib-min:32768',
        'ghr-ec2-cpu-manufacturers:intel,amd',
        'ghr-ec2-instance-generations:current',
      ]);

      expect(result?.InstanceType).toBe('r5.2xlarge');
      expect(result?.MaxPrice).toBe('0.75');
      expect(result?.Priority).toBe(1);
      expect(result?.Placement?.GroupName).toBe('my-group');
      expect(result?.Placement?.Tenancy).toBe('dedicated');
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.VolumeSize).toBe(200);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.VolumeType).toBe('gp3');
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.Encrypted).toBe(true);
      expect(result?.InstanceRequirements?.VCpuCount?.Min).toBe(8);
      expect(result?.InstanceRequirements?.VCpuCount?.Max).toBe(32);
      expect(result?.InstanceRequirements?.MemoryMiB?.Min).toBe(32768);
      expect(result?.InstanceRequirements?.CpuManufacturers).toEqual(['intel', 'amd']);
      expect(result?.InstanceRequirements?.InstanceGenerations).toEqual(['current']);
    });

    it('should handle GPU instance configuration', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([
        'ghr-ec2-accelerator-count-min:1',
        'ghr-ec2-accelerator-count-max:4',
        'ghr-ec2-accelerator-types:gpu',
        'ghr-ec2-accelerator-manufacturers:nvidia',
        'ghr-ec2-accelerator-names:a100,v100',
        'ghr-ec2-accelerator-total-memory-mib-min:16384',
      ]);

      expect(result?.InstanceRequirements?.AcceleratorCount?.Min).toBe(1);
      expect(result?.InstanceRequirements?.AcceleratorCount?.Max).toBe(4);
      expect(result?.InstanceRequirements?.AcceleratorTypes).toEqual(['gpu']);
      expect(result?.InstanceRequirements?.AcceleratorManufacturers).toEqual(['nvidia']);
      expect(result?.InstanceRequirements?.AcceleratorNames).toEqual(['a100', 'v100']);
      expect(result?.InstanceRequirements?.AcceleratorTotalMemoryMiB?.Min).toBe(16384);
    });

    it('should handle network-optimized instance configuration', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([
        'ghr-ec2-network-interface-count-min:2',
        'ghr-ec2-network-interface-count-max:8',
        'ghr-ec2-network-bandwidth-gbps-min:10',
        'ghr-ec2-network-bandwidth-gbps-max:100',
        'ghr-ec2-baseline-ebs-bandwidth-mbps-min:1000',
      ]);

      expect(result?.InstanceRequirements?.NetworkInterfaceCount?.Min).toBe(2);
      expect(result?.InstanceRequirements?.NetworkInterfaceCount?.Max).toBe(8);
      expect(result?.InstanceRequirements?.NetworkBandwidthGbps?.Min).toBe(10);
      expect(result?.InstanceRequirements?.NetworkBandwidthGbps?.Max).toBe(100);
      expect(result?.InstanceRequirements?.BaselineEbsBandwidthMbps?.Min).toBe(1000);
    });

    it('should handle storage-optimized instance configuration', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([
        'ghr-ec2-local-storage:included',
        'ghr-ec2-local-storage-types:ssd',
        'ghr-ec2-total-local-storage-gb-min:500',
        'ghr-ec2-total-local-storage-gb-max:2000',
      ]);

      expect(result?.InstanceRequirements?.LocalStorage).toBe('included');
      expect(result?.InstanceRequirements?.LocalStorageTypes).toEqual(['ssd']);
      expect(result?.InstanceRequirements?.TotalLocalStorageGB?.Min).toBe(500);
      expect(result?.InstanceRequirements?.TotalLocalStorageGB?.Max).toBe(2000);
    });

    it('should handle spot instance configuration with pricing', () => {
      const result = scaleUpModule.parseEc2OverrideConfig([
        'ghr-ec2-max-price:0.50',
        'ghr-ec2-spot-max-price-percentage-over-lowest-price:100',
        'ghr-ec2-on-demand-max-price-percentage-over-lowest-price:150',
      ]);

      expect(result?.MaxPrice).toBe('0.50');
      expect(result?.InstanceRequirements?.SpotMaxPricePercentageOverLowestPrice).toBe(100);
      expect(result?.InstanceRequirements?.OnDemandMaxPricePercentageOverLowestPrice).toBe(150);
    });
>>>>>>> 44df86d7 (test: fix test cases)
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
