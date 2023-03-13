import { EC2 } from 'aws-sdk';
import { performance } from 'perf_hooks';

import ScaleError from './../scale-runners/ScaleError';
import { RunnerInfo, RunnerInputParameters, createRunner, listEC2Runners, terminateRunner } from './runners';

const mockEC2 = { describeInstances: jest.fn(), createFleet: jest.fn(), terminateInstances: jest.fn() };
const mockSSM = { putParameter: jest.fn(), getParameter: jest.fn() };
jest.mock('aws-sdk', () => ({
  EC2: jest.fn().mockImplementation(() => mockEC2),
  SSM: jest.fn().mockImplementation(() => mockSSM),
}));

const LAUNCH_TEMPLATE = 'lt-1';
const ORG_NAME = 'SomeAwesomeCoder';
const REPO_NAME = `${ORG_NAME}/some-amazing-library`;
const ENVIRONMENT = 'unit-test-environment';
const SSM_TOKEN_PATH = '/github-action-runners/default/runners/tokens';
const RUNNER_NAME_PREFIX = '';

const mockDescribeInstances = { promise: jest.fn() };
mockEC2.describeInstances.mockImplementation(() => mockDescribeInstances);
const mockRunningInstances: AWS.EC2.DescribeInstancesResult = {
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
            { Key: 'Type', Value: 'Org' },
            { Key: 'Owner', Value: 'CoderToCat' },
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
    mockDescribeInstances.promise.mockReturnValue(mockRunningInstances);
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
    mockDescribeInstances.promise.mockReturnValueOnce(mockRunningInstances);
    await listEC2Runners();
    expect(mockEC2.describeInstances).toBeCalled();
  });

  it('filters instances on repo name', async () => {
    mockDescribeInstances.promise.mockReturnValueOnce(mockRunningInstances);
    await listEC2Runners({ runnerType: 'Repo', runnerOwner: REPO_NAME, environment: undefined });
    expect(mockEC2.describeInstances).toBeCalledWith({
      Filters: [
        { Name: 'instance-state-name', Values: ['running', 'pending'] },
        { Name: 'tag:Type', Values: ['Repo'] },
        { Name: 'tag:Owner', Values: [REPO_NAME] },
        { Name: 'tag:ghr:Application', Values: ['github-action-runner'] },
      ],
    });
  });

  it('filters instances on org name', async () => {
    mockDescribeInstances.promise.mockReturnValueOnce(mockRunningInstances);
    await listEC2Runners({ runnerType: 'Org', runnerOwner: ORG_NAME, environment: undefined });
    expect(mockEC2.describeInstances).toBeCalledWith({
      Filters: [
        { Name: 'instance-state-name', Values: ['running', 'pending'] },
        { Name: 'tag:Type', Values: ['Org'] },
        { Name: 'tag:Owner', Values: [ORG_NAME] },
        { Name: 'tag:ghr:Application', Values: ['github-action-runner'] },
      ],
    });
  });

  it('filters instances on environment', async () => {
    mockDescribeInstances.promise.mockReturnValueOnce(mockRunningInstances);
    await listEC2Runners({ environment: ENVIRONMENT });
    expect(mockEC2.describeInstances).toBeCalledWith({
      Filters: [
        { Name: 'instance-state-name', Values: ['running', 'pending'] },
        { Name: 'tag:ghr:environment', Values: [ENVIRONMENT] },
        { Name: 'tag:ghr:Application', Values: ['github-action-runner'] },
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
    mockDescribeInstances.promise.mockReturnValueOnce(noInstances);
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
    mockDescribeInstances.promise.mockReturnValueOnce(noInstances);
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
  const mockGetParameter = { promise: jest.fn() };

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

    mockSSM.getParameter.mockImplementation(() => mockGetParameter);
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
        Name: `${SSM_TOKEN_PATH}/${instance}`,
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

  it('calls create fleet of 40 instances (ssm rate limit condition) to test time delay ', async () => {
    const startTime = performance.now();
    const instances = [
      {
        InstanceIds: [
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
        ],
      },
    ];
    mockCreateFleet.promise.mockReturnValue({
      Instances: instances,
    });

    await createRunner({ ...createRunnerConfig(defaultRunnerConfig), numberOfRunners: 40 });
    const endTime = performance.now();

    expect(endTime - startTime).toBeGreaterThan(1000);
    expect(mockEC2.createFleet).toBeCalledWith(
      expectedCreateFleetRequest({ ...defaultExpectedFleetRequestValues, totalTargetCapacity: 40 }),
    );
    expect(mockSSM.putParameter).toBeCalledTimes(40);
    for (const instance of instances[0].InstanceIds) {
      expect(mockSSM.putParameter).toBeCalledWith({
        Name: `${SSM_TOKEN_PATH}/${instance}`,
        Type: 'SecureString',
        Value: '--token foo --url http://github.com',
      });
    }
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
      Name: `${SSM_TOKEN_PATH}/i-1234`,
      Value: '--token foo --url http://github.com',
      Type: 'SecureString',
    });
  });

  it('does not create ssm parameters when no instance is created', async () => {
    mockCreateFleet.promise.mockReturnValue({
      Instances: [],
    });
    await expect(createRunner(createRunnerConfig(defaultRunnerConfig))).rejects.toThrowError(Error);
    expect(mockSSM.putParameter).not.toBeCalled();
  });

  it('uses ami id from ssm parameter when ami id ssm param is specified', async () => {
    const paramValue: AWS.SSM.GetParameterResult = {
      Parameter: {
        Value: 'ami-123',
      },
    };
    mockGetParameter.promise.mockReturnValue(paramValue);
    await createRunner(createRunnerConfig({ ...defaultRunnerConfig, amiIdSsmParameterName: 'my-ami-id-param' }));
    const expectedRequest = expectedCreateFleetRequest({ ...defaultExpectedFleetRequestValues, imageId: 'ami-123' });
    expect(mockEC2.createFleet).toBeCalledWith(expectedRequest);
    expect(mockSSM.getParameter).toBeCalledWith({
      Name: 'my-ami-id-param',
    });
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

    const mockGetParameter = { promise: jest.fn() };

    mockSSM.getParameter.mockImplementation(() => mockGetParameter);
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

  it('test error in ami id lookup from ssm parameter', async () => {
    mockSSM.getParameter.mockImplementation(() => {
      return {
        promise: jest.fn().mockImplementation(() => {
          throw Error('Wow, such transient');
        }),
      };
    });

    await expect(
      createRunner(createRunnerConfig({ ...defaultRunnerConfig, amiIdSsmParameterName: 'my-ami-id-param' })),
    ).rejects.toBeInstanceOf(Error);
    expect(mockEC2.createFleet).not.toBeCalled();
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
  amiIdSsmParameterName?: string;
}

function createRunnerConfig(runnerConfig: RunnerConfig): RunnerInputParameters {
  return {
    runnerServiceConfig: ['--token foo', '--url http://github.com'],
    environment: ENVIRONMENT,
    runnerType: runnerConfig.type,
    runnerOwner: REPO_NAME,
    ssmTokenPath: SSM_TOKEN_PATH,
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
  capacityType: EC2.DefaultTargetCapacityType;
  allocationStrategy: EC2.AllocationStrategy;
  maxSpotPrice?: string;
  totalTargetCapacity: number;
  imageId?: string;
}

function expectedCreateFleetRequest(expectedValues: ExpectedFleetRequestValues): AWS.EC2.CreateFleetRequest {
  const request: AWS.EC2.CreateFleetRequest = {
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
          { Key: 'ghr:Application', Value: 'github-action-runner' },
          { Key: 'ghr:created_by', Value: expectedValues.totalTargetCapacity > 1 ? 'pool-lambda' : 'scale-up-lambda' },
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

  if (expectedValues.imageId) {
    for (const config of request.LaunchTemplateConfigs) {
      if (config.Overrides) {
        for (const override of config.Overrides) {
          override.ImageId = expectedValues.imageId;
        }
      }
    }
  }

  return request;
}
