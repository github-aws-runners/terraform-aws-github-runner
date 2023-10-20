import {
  CreateFleetCommand,
  CreateFleetCommandInput,
  CreateFleetResult,
  DefaultTargetCapacityType,
  DescribeInstancesCommand,
  DescribeInstancesResult,
  EC2Client,
  SpotAllocationStrategy,
  TerminateInstancesCommand,
} from '@aws-sdk/client-ec2';
import { GetParameterCommand, GetParameterResult, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

import ScaleError from './../scale-runners/ScaleError';
import { createRunner, listEC2Runners, terminateRunner } from './runners';
import { RunnerInfo, RunnerInputParameters, RunnerType } from './runners.d';

process.env.AWS_REGION = 'eu-east-1';
const mockEC2Client = mockClient(EC2Client);
const mockSSMClient = mockClient(SSMClient);

const LAUNCH_TEMPLATE = 'lt-1';
const ORG_NAME = 'SomeAwesomeCoder';
const REPO_NAME = `${ORG_NAME}/some-amazing-library`;
const ENVIRONMENT = 'unit-test-environment';
const RUNNER_NAME_PREFIX = '';
const RUNNER_TYPES: RunnerType[] = ['Repo', 'Org'];

mockEC2Client.on(DescribeInstancesCommand).resolves({});

const mockRunningInstances: DescribeInstancesResult = {
  Reservations: [
    {
      Instances: [
        {
          LaunchTime: new Date('2020-10-10T14:48:00.000+09:00'),
          InstanceId: 'i-1234',
          Tags: [
            { Key: 'ghr:Application', Value: 'github-action-runner' },
            { Key: 'ghr:runner_name_prefix', Value: RUNNER_NAME_PREFIX },
            { Key: 'ghr:created_by', Value: 'scale-up-lambda' },
            { Key: 'ghr:Type', Value: 'Org' },
            { Key: 'ghr:Owner', Value: 'CoderToCat' },
          ],
        },
      ],
    },
  ],
};

describe('list instances', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('returns a list of instances', async () => {
    mockEC2Client.on(DescribeInstancesCommand).resolves(mockRunningInstances);
    const resp = await listEC2Runners();
    expect(resp.length).toBe(1);
    expect(resp).toContainEqual({
      instanceId: 'i-1234',
      launchTime: new Date('2020-10-10T14:48:00.000+09:00'),
      type: 'Org',
      owner: 'CoderToCat',
    });
  });

  it('calls EC2 describe instances', async () => {
    mockEC2Client.on(DescribeInstancesCommand).resolves(mockRunningInstances);
    await listEC2Runners();
    expect(mockEC2Client).toHaveReceivedCommand(DescribeInstancesCommand);
  });

  it('filters instances on repo name', async () => {
    mockEC2Client.on(DescribeInstancesCommand).resolves(mockRunningInstances);
    await listEC2Runners({ runnerType: 'Repo', runnerOwner: REPO_NAME, environment: undefined });
    expect(mockEC2Client).toHaveReceivedCommandWith(DescribeInstancesCommand, {
      Filters: [
        { Name: 'instance-state-name', Values: ['running', 'pending'] },
        { Name: 'tag:ghr:Type', Values: ['Repo'] },
        { Name: 'tag:ghr:Owner', Values: [REPO_NAME] },
        { Name: 'tag:ghr:Application', Values: ['github-action-runner'] },
      ],
    });
  });

  it('filters instances on org name', async () => {
    mockEC2Client.on(DescribeInstancesCommand).resolves(mockRunningInstances);
    await listEC2Runners({ runnerType: 'Org', runnerOwner: ORG_NAME, environment: undefined });
    expect(mockEC2Client).toHaveReceivedCommandWith(DescribeInstancesCommand, {
      Filters: [
        { Name: 'instance-state-name', Values: ['running', 'pending'] },
        { Name: 'tag:ghr:Type', Values: ['Org'] },
        { Name: 'tag:ghr:Owner', Values: [ORG_NAME] },
        { Name: 'tag:ghr:Application', Values: ['github-action-runner'] },
      ],
    });
  });

  it('filters instances on environment', async () => {
    mockEC2Client.on(DescribeInstancesCommand).resolves(mockRunningInstances);
    await listEC2Runners({ environment: ENVIRONMENT });
    expect(mockEC2Client).toHaveReceivedCommandWith(DescribeInstancesCommand, {
      Filters: [
        { Name: 'instance-state-name', Values: ['running', 'pending'] },
        { Name: 'tag:ghr:environment', Values: [ENVIRONMENT] },
        { Name: 'tag:ghr:Application', Values: ['github-action-runner'] },
      ],
    });
  });

  it('No instances, undefined reservations list.', async () => {
    const noInstances: DescribeInstancesResult = {
      Reservations: undefined,
    };
    mockEC2Client.on(DescribeInstancesCommand).resolves(noInstances);
    const resp = await listEC2Runners();
    expect(resp.length).toBe(0);
  });

  it('Instances with no tags.', async () => {
    const noInstances: DescribeInstancesResult = {
      Reservations: [
        {
          Instances: [
            {
              LaunchTime: new Date('2020-10-11T14:48:00.000+09:00'),
              InstanceId: 'i-5678',
              Tags: undefined,
            },
          ],
        },
      ],
    };
    mockEC2Client.on(DescribeInstancesCommand).resolves(noInstances);
    const resp = await listEC2Runners();
    expect(resp.length).toBe(1);
  });
});

describe('terminate runner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it('calls terminate instances with the right instance ids', async () => {
    mockEC2Client.on(TerminateInstancesCommand).resolves({});
    const runner: RunnerInfo = {
      instanceId: 'instance-2',
      owner: 'owner-2',
      type: 'Repo',
    };
    await terminateRunner(runner.instanceId);

    expect(mockEC2Client).toHaveReceivedCommandWith(TerminateInstancesCommand, { InstanceIds: [runner.instanceId] });
  });
});

describe('create runner', () => {
  const defaultRunnerConfig: RunnerConfig = {
    allocationStrategy: SpotAllocationStrategy.CAPACITY_OPTIMIZED,
    capacityType: 'spot',
    type: 'Org',
  };

  const defaultExpectedFleetRequestValues: ExpectedFleetRequestValues = {
    type: 'Org',
    capacityType: 'spot',
    allocationStrategy: SpotAllocationStrategy.CAPACITY_OPTIMIZED,
    totalTargetCapacity: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockEC2Client.reset();
    mockSSMClient.reset();

    //mockEC2.createFleet.mockImplementation(() => mockCreateFleet);
    mockEC2Client.on(CreateFleetCommand).resolves({ Instances: [{ InstanceIds: ['i-1234'] }] });
    mockSSMClient.on(GetParameterCommand).resolves({});
  });

  it.each(RUNNER_TYPES)('calls create fleet of 1 instance with the default config for %p', async (type: RunnerType) => {
    await createRunner(createRunnerConfig({ ...defaultRunnerConfig, type: type }));

    expect(mockEC2Client).toHaveReceivedCommandWith(CreateFleetCommand, {
      ...expectedCreateFleetRequest({ ...defaultExpectedFleetRequestValues, type: type }),
    });
  });

  it('calls create fleet of 2 instances with the correct config for org ', async () => {
    const instances = [{ InstanceIds: ['i-1234', 'i-5678'] }];

    mockEC2Client.on(CreateFleetCommand).resolves({ Instances: instances });

    await createRunner({ ...createRunnerConfig(defaultRunnerConfig), numberOfRunners: 2 });

    expect(mockEC2Client).toHaveReceivedCommandWith(CreateFleetCommand, {
      ...expectedCreateFleetRequest({ ...defaultExpectedFleetRequestValues, totalTargetCapacity: 2 }),
    });
  });

  it('calls create fleet of 1 instance with the on-demand capacity', async () => {
    await createRunner(createRunnerConfig({ ...defaultRunnerConfig, capacityType: 'on-demand' }));
    expect(mockEC2Client).toHaveReceivedCommandWith(CreateFleetCommand, {
      ...expectedCreateFleetRequest({ ...defaultExpectedFleetRequestValues, capacityType: 'on-demand' }),
    });
  });

  it('calls run instances with the on-demand capacity', async () => {
    await createRunner(createRunnerConfig({ ...defaultRunnerConfig, maxSpotPrice: '0.1' }));
    expect(mockEC2Client).toHaveReceivedCommandWith(CreateFleetCommand, {
      ...expectedCreateFleetRequest({ ...defaultExpectedFleetRequestValues, maxSpotPrice: '0.1' }),
    });
  });

  it('does not create ssm parameters when no instance is created', async () => {
    mockEC2Client.on(CreateFleetCommand).resolves({ Instances: [] });
    await expect(createRunner(createRunnerConfig(defaultRunnerConfig))).rejects.toThrowError(Error);
    expect(mockSSMClient).not.toHaveReceivedCommand(PutParameterCommand);
  });

  it('uses ami id from ssm parameter when ami id ssm param is specified', async () => {
    const paramValue: GetParameterResult = {
      Parameter: {
        Value: 'ami-123',
      },
    };
    mockSSMClient.on(GetParameterCommand).resolves(paramValue);
    await createRunner(createRunnerConfig({ ...defaultRunnerConfig, amiIdSsmParameterName: 'my-ami-id-param' }));
    const expectedRequest = expectedCreateFleetRequest({ ...defaultExpectedFleetRequestValues, imageId: 'ami-123' });
    expect(mockEC2Client).toHaveReceivedCommandWith(CreateFleetCommand, expectedRequest);
    expect(mockSSMClient).toHaveReceivedCommandWith(GetParameterCommand, {
      Name: 'my-ami-id-param',
    });
  });
});

describe('create runner with errors', () => {
  const defaultRunnerConfig: RunnerConfig = {
    allocationStrategy: SpotAllocationStrategy.CAPACITY_OPTIMIZED,
    capacityType: 'spot',
    type: 'Repo',
  };
  const defaultExpectedFleetRequestValues: ExpectedFleetRequestValues = {
    type: 'Repo',
    capacityType: 'spot',
    allocationStrategy: SpotAllocationStrategy.CAPACITY_OPTIMIZED,
    totalTargetCapacity: 1,
  };
  beforeEach(() => {
    jest.clearAllMocks();
    mockEC2Client.reset();
    mockSSMClient.reset();

    mockSSMClient.on(PutParameterCommand).resolves({});
    mockSSMClient.on(GetParameterCommand).resolves({});
    mockEC2Client.on(CreateFleetCommand).resolves({ Instances: [] });
  });

  it('test ScaleError with one error.', async () => {
    createFleetMockWithErrors(['UnfulfillableCapacity']);

    await expect(createRunner(createRunnerConfig(defaultRunnerConfig))).rejects.toBeInstanceOf(ScaleError);
    expect(mockEC2Client).toHaveReceivedCommandWith(
      CreateFleetCommand,
      expectedCreateFleetRequest(defaultExpectedFleetRequestValues),
    );
    expect(mockSSMClient).not.toHaveReceivedCommand(PutParameterCommand);
  });

  it('test ScaleError with multiple error.', async () => {
    createFleetMockWithErrors(['UnfulfillableCapacity', 'SomeError']);

    await expect(createRunner(createRunnerConfig(defaultRunnerConfig))).rejects.toBeInstanceOf(ScaleError);
    expect(mockEC2Client).toHaveReceivedCommandWith(
      CreateFleetCommand,
      expectedCreateFleetRequest(defaultExpectedFleetRequestValues),
    );
    expect(mockSSMClient).not.toHaveReceivedCommand(PutParameterCommand);
  });

  it('test default Error', async () => {
    createFleetMockWithErrors(['NonMappedError']);

    await expect(createRunner(createRunnerConfig(defaultRunnerConfig))).rejects.toBeInstanceOf(Error);
    expect(mockEC2Client).toHaveReceivedCommandWith(
      CreateFleetCommand,
      expectedCreateFleetRequest(defaultExpectedFleetRequestValues),
    );
    expect(mockSSMClient).not.toHaveReceivedCommand(PutParameterCommand);
  });

  it('test now error is thrown if an instance is created', async () => {
    createFleetMockWithErrors(['NonMappedError'], ['i-123']);

    expect(await createRunner(createRunnerConfig(defaultRunnerConfig))).resolves;
    expect(mockEC2Client).toHaveReceivedCommandWith(
      CreateFleetCommand,
      expectedCreateFleetRequest(defaultExpectedFleetRequestValues),
    );
  });

  it('test error by create fleet call is thrown.', async () => {
    mockEC2Client.on(CreateFleetCommand).rejects(new Error('Some error'));

    await expect(createRunner(createRunnerConfig(defaultRunnerConfig))).rejects.toBeInstanceOf(Error);
    expect(mockEC2Client).toHaveReceivedCommandWith(
      CreateFleetCommand,
      expectedCreateFleetRequest(defaultExpectedFleetRequestValues),
    );
    expect(mockSSMClient).not.toHaveReceivedCommand(PutParameterCommand);
  });

  it('test error in ami id lookup from ssm parameter', async () => {
    mockSSMClient.on(GetParameterCommand).rejects(new Error('Some error'));

    await expect(
      createRunner(createRunnerConfig({ ...defaultRunnerConfig, amiIdSsmParameterName: 'my-ami-id-param' })),
    ).rejects.toBeInstanceOf(Error);
    expect(mockEC2Client).not.toHaveReceivedCommand(CreateFleetCommand);
    expect(mockSSMClient).not.toHaveReceivedCommand(PutParameterCommand);
  });
});

function createFleetMockWithErrors(errors: string[], instances?: string[]) {
  let result: CreateFleetResult = {
    Errors: errors.map((e) => ({ ErrorCode: e })),
  };

  if (instances) {
    result = {
      ...result,
      Instances: [
        {
          InstanceIds: instances.map((i) => i),
        },
      ],
    };
  }

  mockEC2Client.on(CreateFleetCommand).resolves(result);
}

interface RunnerConfig {
  type: RunnerType;
  capacityType: DefaultTargetCapacityType;
  allocationStrategy: SpotAllocationStrategy;
  maxSpotPrice?: string;
  amiIdSsmParameterName?: string;
}

function createRunnerConfig(runnerConfig: RunnerConfig): RunnerInputParameters {
  return {
    environment: ENVIRONMENT,
    runnerType: runnerConfig.type,
    runnerOwner: REPO_NAME,
    launchTemplateName: LAUNCH_TEMPLATE,
    ec2instanceCriteria: {
      instanceTypes: ['m5.large', 'c5.large'],
      targetCapacityType: runnerConfig.capacityType,
      maxSpotPrice: runnerConfig.maxSpotPrice,
      instanceAllocationStrategy: runnerConfig.allocationStrategy,
    },
    subnets: ['subnet-123', 'subnet-456'],
    amiIdSsmParameterName: runnerConfig.amiIdSsmParameterName,
  };
}

interface ExpectedFleetRequestValues {
  type: 'Repo' | 'Org';
  capacityType: DefaultTargetCapacityType;
  allocationStrategy: SpotAllocationStrategy;
  maxSpotPrice?: string;
  totalTargetCapacity: number;
  imageId?: string;
}

function expectedCreateFleetRequest(expectedValues: ExpectedFleetRequestValues): CreateFleetCommandInput {
  const tags = [
    { Key: 'ghr:Application', Value: 'github-action-runner' },
    { Key: 'ghr:created_by', Value: expectedValues.totalTargetCapacity > 1 ? 'pool-lambda' : 'scale-up-lambda' },
    { Key: 'ghr:Type', Value: expectedValues.type },
    { Key: 'ghr:Owner', Value: REPO_NAME },
  ];
  const request: CreateFleetCommandInput = {
    LaunchTemplateConfigs: [
      {
        LaunchTemplateSpecification: {
          LaunchTemplateName: 'lt-1',
          Version: '$Default',
        },
        Overrides: [
          {
            InstanceType: 'm5.large',
            SubnetId: 'subnet-123',
          },
          {
            InstanceType: 'c5.large',
            SubnetId: 'subnet-123',
          },
          {
            InstanceType: 'm5.large',
            SubnetId: 'subnet-456',
          },
          {
            InstanceType: 'c5.large',
            SubnetId: 'subnet-456',
          },
        ],
      },
    ],
    SpotOptions: {
      AllocationStrategy: expectedValues.allocationStrategy,
      MaxTotalPrice: expectedValues.maxSpotPrice,
    },
    TagSpecifications: [
      {
        ResourceType: 'instance',
        Tags: tags,
      },
      {
        ResourceType: 'volume',
        Tags: tags,
      },
    ],
    TargetCapacitySpecification: {
      DefaultTargetCapacityType: expectedValues.capacityType,
      TotalTargetCapacity: expectedValues.totalTargetCapacity,
    },
    Type: 'instant',
  };

  if (expectedValues.imageId) {
    for (const config of request?.LaunchTemplateConfigs || []) {
      if (config.Overrides) {
        for (const override of config.Overrides) {
          override.ImageId = expectedValues.imageId;
        }
      }
    }
  }

  return request;
}
