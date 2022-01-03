import { listEC2Runners, createRunner, terminateRunner, RunnerInfo, RunnerInputParameters } from './runners';
import ScaleError from './ScaleError';

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
  beforeEach(() => {
    jest.clearAllMocks();

    mockEC2.createFleet.mockImplementation(() => mockCreateFleet);

    mockCreateFleet.promise.mockReturnValue({
      Instances: [{ InstanceIds: ['i-1234'] }],
    });
    mockSSM.putParameter.mockImplementation(() => mockPutParameter);
  });

  it('calls run instances with the correct config for repo', async () => {
    await createRunner(createRunnerConfig('Repo'));
    expect(mockEC2.createFleet).toBeCalledWith(expectedCreateFleetRequest('Repo'));
  });

  it('calls run instances with the correct config for org', async () => {
    await createRunner(createRunnerConfig('Org'));
    expect(mockEC2.createFleet).toBeCalledWith(expectedCreateFleetRequest('Org'));
  });

  it('calls run instances with the on-demand capacity', async () => {
    await createRunner(createRunnerConfig('Org', 'on-demand'));
    expect(mockEC2.createFleet).toBeCalledWith(expectedCreateFleetRequest('Org', 'on-demand'));
  });

  it('creates ssm parameters for each created instance', async () => {
    await createRunner(createRunnerConfig('Org'));
    expect(mockSSM.putParameter).toBeCalledWith({
      Name: `${ENVIRONMENT}-i-1234`,
      Value: 'bla',
      Type: 'SecureString',
    });
  });

  it('does not create ssm parameters when no instance is created', async () => {
    mockCreateFleet.promise.mockReturnValue({
      Instances: [],
    });
    await expect(createRunner(createRunnerConfig('Org'))).rejects;
    expect(mockSSM.putParameter).not.toBeCalled();
  });
});

describe('create runner with errors', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    const mockPutParameter = { promise: jest.fn() };

    mockSSM.putParameter.mockImplementation(() => mockPutParameter);
  });

  it('test ScaleError with one error.', async () => {
    createFleetMockWithErrors(['UnfulfillableCapacity']);

    await expect(createRunner(createRunnerConfig('Repo'))).rejects.toBeInstanceOf(ScaleError);
    expect(mockEC2.createFleet).toBeCalledWith(expectedCreateFleetRequest('Repo'));
    expect(mockSSM.putParameter).not.toBeCalled();
  });

  it('test ScaleError with multiple error.', async () => {
    createFleetMockWithErrors(['UnfulfillableCapacity', 'SomeError']);

    await expect(createRunner(createRunnerConfig('Repo'))).rejects.toBeInstanceOf(ScaleError);
    expect(mockEC2.createFleet).toBeCalledWith(expectedCreateFleetRequest('Repo'));
    expect(mockSSM.putParameter).not.toBeCalled();
  });

  it('test default Error', async () => {
    createFleetMockWithErrors(['NonMappedError']);

    await expect(createRunner(createRunnerConfig('Org'))).rejects.toBeInstanceOf(Error);
    expect(mockEC2.createFleet).toBeCalledWith(expectedCreateFleetRequest('Org'));
    expect(mockSSM.putParameter).not.toBeCalled();
  });

  it('test now error is thrown if an instance is created', async () => {
    createFleetMockWithErrors(['NonMappedError'], ['i-123']);

    expect(await createRunner(createRunnerConfig('Repo'))).resolves;
    expect(mockEC2.createFleet).toBeCalledWith(expectedCreateFleetRequest('Repo'));
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

    await expect(createRunner(createRunnerConfig('Repo'))).rejects.toBeInstanceOf(Error);
    expect(mockEC2.createFleet).toBeCalledWith(expectedCreateFleetRequest('Repo'));
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

function createRunnerConfig(type: 'Repo' | 'Org', capacityType: 'spot' | 'on-demand' = 'spot'): RunnerInputParameters {
  return {
    runnerServiceConfig: 'bla',
    environment: ENVIRONMENT,
    runnerType: type,
    runnerOwner: REPO_NAME,
    launchTemplateName: LAUNCH_TEMPLATE,
    ec2instanceCriteria: {
      instanceTypes: ['m5.large', 'c5.large'],
      targetCapacityType: capacityType,
    },
    subnets: ['subnet-123', 'subnet-456'],
  };
}

function expectedCreateFleetRequest(
  type: 'Repo' | 'Org',
  capacityType: 'spot' | 'on-demand' = 'spot',
): AWS.EC2.CreateFleetRequest {
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
    TagSpecifications: [
      {
        ResourceType: 'instance',
        Tags: [
          { Key: 'Application', Value: 'github-action-runner' },
          { Key: 'Type', Value: type },
          { Key: 'Owner', Value: REPO_NAME },
        ],
      },
    ],
    TargetCapacitySpecification: {
      DefaultTargetCapacityType: capacityType,
      TotalTargetCapacity: 1,
    },
    Type: 'instant',
  };
}
