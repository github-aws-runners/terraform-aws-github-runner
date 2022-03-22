import { EC2 } from 'aws-sdk';

import ScaleError from './../scale-runners/ScaleError';
import { RunnerInfo, RunnerInputParameters, createRunner, listEC2Runners, terminateRunner } from './runners';

const mockEC2 = { describeInstances: jest.fn(), createFleet: jest.fn(), terminateInstances: jest.fn() };
const mockSSM = { putParameter: jest.fn() };
jest.mock('aws-sdk', () => ({
  EC2: jest.fn().mockImplementation(() => mockEC2),
  SSM: jest.fn().mockImplementation(() => mockSSM),
}));

const LAUNCH_TEMPLATE = 'lt-1';
const ORG_NAME = 'SomeAwesomeCoder';
const REPO_NAME = `${ORG_NAME}/some-amazing-library`;
const ENVIRONMENT = 'unit-test-environment';

describe('list instances', () => {
  const mockDescribeInstances = { promise: jest.fn() };
  beforeEach(() => {
    jest.clearAllMocks();
    mockEC2.describeInstances.mockImplementation(() => mockDescribeInstances);
    const mockRunningInstances: AWS.EC2.DescribeInstancesResult = {
      Reservations: [
        {
          Instances: [
            {
              LaunchTime: new Date('2020-10-10T14:48:00.000+09:00'),
              InstanceId: 'i-1234',
              Tags: [
                { Key: 'Application', Value: 'github-action-runner' },
                { Key: 'Type', Value: 'Org' },
                { Key: 'Owner', Value: 'CoderToCat' },
              ],
            },
            {
              LaunchTime: new Date('2020-10-11T14:48:00.000+09:00'),
              InstanceId: 'i-5678',
              Tags: [
                { Key: 'Owner', Value: REPO_NAME },
                { Key: 'Type', Value: 'Repo' },
                { Key: 'Application', Value: 'github-action-runner' },
              ],
            },
          ],
        },
      ],
    };
    mockDescribeInstances.promise.mockReturnValue(mockRunningInstances);
  });

  it('returns a list of instances', async () => {
    const resp = await listEC2Runners();
    expect(resp.length).toBe(2);
    expect(resp).toContainEqual({
      instanceId: 'i-1234',
      launchTime: new Date('2020-10-10T14:48:00.000+09:00'),
      type: 'Org',
      owner: 'CoderToCat',
    });
    expect(resp).toContainEqual({
      instanceId: 'i-5678',
      launchTime: new Date('2020-10-11T14:48:00.000+09:00'),
      type: 'Repo',
      owner: REPO_NAME,
    });
  });

  it('calls EC2 describe instances', async () => {
    await listEC2Runners();
    expect(mockEC2.describeInstances).toBeCalled();
  });

  it('filters instances on repo name', async () => {
    await listEC2Runners({ runnerType: 'Repo', runnerOwner: REPO_NAME, environment: undefined });
    expect(mockEC2.describeInstances).toBeCalledWith({
      Filters: [
        { Name: 'tag:Application', Values: ['github-action-runner'] },
        { Name: 'instance-state-name', Values: ['running', 'pending'] },
        { Name: 'tag:Type', Values: ['Repo'] },
        { Name: 'tag:Owner', Values: [REPO_NAME] },
      ],
    });
  });

  it('filters instances on org name', async () => {
    await listEC2Runners({ runnerType: 'Org', runnerOwner: ORG_NAME, environment: undefined });
    expect(mockEC2.describeInstances).toBeCalledWith({
      Filters: [
        { Name: 'tag:Application', Values: ['github-action-runner'] },
        { Name: 'instance-state-name', Values: ['running', 'pending'] },
        { Name: 'tag:Type', Values: ['Org'] },
        { Name: 'tag:Owner', Values: [ORG_NAME] },
      ],
    });
  });

  it('filters instances on environment', async () => {
    await listEC2Runners({ environment: ENVIRONMENT });
    expect(mockEC2.describeInstances).toBeCalledWith({
      Filters: [
        { Name: 'tag:Application', Values: ['github-action-runner'] },
        { Name: 'instance-state-name', Values: ['running', 'pending'] },
        { Name: 'tag:Environment', Values: [ENVIRONMENT] },
      ],
    });
  });

  it('No instances, undefined reservations list.', async () => {
    const noInstances: AWS.EC2.DescribeInstancesResult = {
      Reservations: undefined,
    };
    mockDescribeInstances.promise.mockReturnValue(noInstances);
    const resp = await listEC2Runners();
    expect(resp.length).toBe(0);
  });

  it('No instances, undefined instance list.', async () => {
    const noInstances: AWS.EC2.DescribeInstancesResult = {
      Reservations: [
        {
          Instances: undefined,
        },
      ],
    };
    mockDescribeInstances.promise.mockReturnValue(noInstances);
    const resp = await listEC2Runners();
    expect(resp.length).toBe(0);
  });

  it('Instances with no tags.', async () => {
    const noInstances: AWS.EC2.DescribeInstancesResult = {
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
    mockDescribeInstances.promise.mockReturnValue(noInstances);
    const resp = await listEC2Runners();
    expect(resp.length).toBe(1);
  });
});

describe('terminate runner', () => {
  const mockTerminateInstances = { promise: jest.fn() };
  beforeEach(() => {
    jest.clearAllMocks();
    mockEC2.terminateInstances.mockImplementation(() => mockTerminateInstances);
    mockTerminateInstances.promise.mockReturnThis();
  });
  it('calls terminate instances with the right instance ids', async () => {
    const runner: RunnerInfo = {
      instanceId: 'instance-2',
      owner: 'owner-2',
      type: 'Repo',
    };
    await terminateRunner(runner.instanceId);

    expect(mockEC2.terminateInstances).toBeCalledWith({ InstanceIds: [runner.instanceId] });
  });
});

describe('create runner', () => {
  const mockCreateFleet = { promise: jest.fn() };
  const mockPutParameter = { promise: jest.fn() };
  const defaultRunnerConfig: RunnerConfig = {
    allocationStrategy: 'capacity-optimized',
    capacityType: 'spot',
    type: 'Org',
  };
  const defaultExpectedFleetRequestValues: ExpectedFleetRequestValues = {
    type: 'Org',
    capacityType: 'spot',
    allocationStrategy: 'capacity-optimized',
    totalTargetCapacity: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockEC2.createFleet.mockImplementation(() => mockCreateFleet);

    mockCreateFleet.promise.mockReturnValue({
      Instances: [{ InstanceIds: ['i-1234'] }],
    });
    mockSSM.putParameter.mockImplementation(() => mockPutParameter);
  });

  it('calls create fleet of 1 instance with the correct config for repo', async () => {
    await createRunner(createRunnerConfig({ ...defaultRunnerConfig, type: 'Repo' }));
    expect(mockEC2.createFleet).toBeCalledWith(
      expectedCreateFleetRequest({ ...defaultExpectedFleetRequestValues, type: 'Repo' }),
    );
    expect(mockSSM.putParameter).toBeCalledTimes(1);
  });

  it('calls create fleet of 2 instances with the correct config for org ', async () => {
    const instances = [{ InstanceIds: ['i-1234', 'i-5678'] }];
    mockCreateFleet.promise.mockReturnValue({
      Instances: instances,
    });

    await createRunner({ ...createRunnerConfig(defaultRunnerConfig), numberOfRunners: 2 });

    expect(mockEC2.createFleet).toBeCalledWith(
      expectedCreateFleetRequest({ ...defaultExpectedFleetRequestValues, totalTargetCapacity: 2 }),
    );
    expect(mockSSM.putParameter).toBeCalledTimes(2);
    for (const instance of instances[0].InstanceIds) {
      expect(mockSSM.putParameter).toBeCalledWith({
        Name: `unit-test-environment-${instance}`,
        Type: 'SecureString',
        Value: '--token foo --url http://github.com',
      });
    }
  });

  it('calls create fleet of 1 instance with the correct config for org', async () => {
    await createRunner(createRunnerConfig(defaultRunnerConfig));
    expect(mockEC2.createFleet).toBeCalledWith(expectedCreateFleetRequest(defaultExpectedFleetRequestValues));
    expect(mockSSM.putParameter).toBeCalledTimes(1);
  });

  it('calls create fleet of 1 instance with the on-demand capacity', async () => {
    await createRunner(createRunnerConfig({ ...defaultRunnerConfig, capacityType: 'on-demand' }));
    expect(mockEC2.createFleet).toBeCalledWith(
      expectedCreateFleetRequest({ ...defaultExpectedFleetRequestValues, capacityType: 'on-demand' }),
    );
    expect(mockSSM.putParameter).toBeCalledTimes(1);
  });

  it('calls run instances with the on-demand capacity', async () => {
    await createRunner(createRunnerConfig({ ...defaultRunnerConfig, maxSpotPrice: '0.1' }));
    expect(mockEC2.createFleet).toBeCalledWith(
      expectedCreateFleetRequest({ ...defaultExpectedFleetRequestValues, maxSpotPrice: '0.1' }),
    );
  });

  it('creates ssm parameters for each created instance', async () => {
    await createRunner(createRunnerConfig(defaultRunnerConfig));
    expect(mockSSM.putParameter).toBeCalledWith({
      Name: `${ENVIRONMENT}-i-1234`,
      Value: '--token foo --url http://github.com',
      Type: 'SecureString',
    });
  });

  it('does not create ssm parameters when no instance is created', async () => {
    mockCreateFleet.promise.mockReturnValue({
      Instances: [],
    });
    await expect(createRunner(createRunnerConfig(defaultRunnerConfig))).rejects;
    expect(mockSSM.putParameter).not.toBeCalled();
  });
});

describe('create runner with errors', () => {
  const defaultRunnerConfig: RunnerConfig = {
    allocationStrategy: 'capacity-optimized',
    capacityType: 'spot',
    type: 'Repo',
  };
  const defaultExpectedFleetRequestValues: ExpectedFleetRequestValues = {
    type: 'Repo',
    capacityType: 'spot',
    allocationStrategy: 'capacity-optimized',
    totalTargetCapacity: 1,
  };
  beforeEach(() => {
    jest.clearAllMocks();

    const mockPutParameter = { promise: jest.fn() };

    mockSSM.putParameter.mockImplementation(() => mockPutParameter);
  });

  it('test ScaleError with one error.', async () => {
    createFleetMockWithErrors(['UnfulfillableCapacity']);

    await expect(createRunner(createRunnerConfig(defaultRunnerConfig))).rejects.toBeInstanceOf(ScaleError);
    expect(mockEC2.createFleet).toBeCalledWith(expectedCreateFleetRequest(defaultExpectedFleetRequestValues));
    expect(mockSSM.putParameter).not.toBeCalled();
  });

  it('test ScaleError with multiple error.', async () => {
    createFleetMockWithErrors(['UnfulfillableCapacity', 'SomeError']);

    await expect(createRunner(createRunnerConfig(defaultRunnerConfig))).rejects.toBeInstanceOf(ScaleError);
    expect(mockEC2.createFleet).toBeCalledWith(expectedCreateFleetRequest(defaultExpectedFleetRequestValues));
    expect(mockSSM.putParameter).not.toBeCalled();
  });

  it('test default Error', async () => {
    createFleetMockWithErrors(['NonMappedError']);

    await expect(createRunner(createRunnerConfig(defaultRunnerConfig))).rejects.toBeInstanceOf(Error);
    expect(mockEC2.createFleet).toBeCalledWith(expectedCreateFleetRequest(defaultExpectedFleetRequestValues));
    expect(mockSSM.putParameter).not.toBeCalled();
  });

  it('test now error is thrown if an instance is created', async () => {
    createFleetMockWithErrors(['NonMappedError'], ['i-123']);

    expect(await createRunner(createRunnerConfig(defaultRunnerConfig))).resolves;
    expect(mockEC2.createFleet).toBeCalledWith(expectedCreateFleetRequest(defaultExpectedFleetRequestValues));
    expect(mockSSM.putParameter).toBeCalled();
  });

  it('test error by create fleet call is thrown.', async () => {
    mockEC2.createFleet.mockImplementation(() => {
      return {
        promise: jest.fn().mockImplementation(() => {
          throw Error('');
        }),
      };
    });

    await expect(createRunner(createRunnerConfig(defaultRunnerConfig))).rejects.toBeInstanceOf(Error);
    expect(mockEC2.createFleet).toBeCalledWith(expectedCreateFleetRequest(defaultExpectedFleetRequestValues));
    expect(mockSSM.putParameter).not.toBeCalled();
  });
});

function createFleetMockWithErrors(errors: string[], instances?: string[]) {
  let result: AWS.EC2.CreateFleetResult = {
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

  mockEC2.createFleet.mockImplementation(() => {
    return { promise: jest.fn().mockReturnValue(result) };
  });
}

interface RunnerConfig {
  type: 'Repo' | 'Org';
  capacityType: EC2.DefaultTargetCapacityType;
  allocationStrategy: EC2.AllocationStrategy;
  maxSpotPrice?: string;
}

function createRunnerConfig(runnerConfig: RunnerConfig): RunnerInputParameters {
  return {
    runnerServiceConfig: ['--token foo', '--url http://github.com'],
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
  };
}

interface ExpectedFleetRequestValues {
  type: 'Repo' | 'Org';
  capacityType: EC2.DefaultTargetCapacityType;
  allocationStrategy: EC2.AllocationStrategy;
  maxSpotPrice?: string;
  totalTargetCapacity: number;
}

function expectedCreateFleetRequest(expectedValues: ExpectedFleetRequestValues): AWS.EC2.CreateFleetRequest {
  return {
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
        Tags: [
          { Key: 'Application', Value: 'github-action-runner' },
          { Key: 'Type', Value: expectedValues.type },
          { Key: 'Owner', Value: REPO_NAME },
        ],
      },
    ],
    TargetCapacitySpecification: {
      DefaultTargetCapacityType: expectedValues.capacityType,
      TotalTargetCapacity: expectedValues.totalTargetCapacity,
    },
    Type: 'instant',
  };
}
