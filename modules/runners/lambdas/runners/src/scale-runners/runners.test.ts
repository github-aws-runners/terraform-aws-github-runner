import { listRunners, createRunner } from './runners';

const mockEC2 = { describeInstances: jest.fn(), runInstances: jest.fn() };
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
                { Key: 'Repo', Value: 'CoderToCat/hello-world' },
                { Key: 'Org', Value: 'CoderToCat' },
                { Key: 'Application', Value: 'github-action-runner' },
              ],
            },
            {
              LaunchTime: new Date('2020-10-11T14:48:00.000+09:00'),
              InstanceId: 'i-5678',
              Tags: [
                { Key: 'Repo', Value: REPO_NAME },
                { Key: 'Org', Value: ORG_NAME },
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
    const resp = await listRunners();
    expect(resp.length).toBe(2);
    expect(resp).toContainEqual({
      instanceId: 'i-1234',
      launchTime: new Date('2020-10-10T14:48:00.000+09:00'),
      repo: 'CoderToCat/hello-world',
      org: 'CoderToCat',
    });
    expect(resp).toContainEqual({
      instanceId: 'i-5678',
      launchTime: new Date('2020-10-11T14:48:00.000+09:00'),
      repo: REPO_NAME,
      org: ORG_NAME,
    });
  });

  it('calls EC2 describe instances', async () => {
    await listRunners();
    expect(mockEC2.describeInstances).toBeCalled();
  });

  it('filters instances on repo name', async () => {
    await listRunners({ runnerType: 'Repo', runnerOwner: REPO_NAME, environment: undefined });
    expect(mockEC2.describeInstances).toBeCalledWith({
      Filters: [
        { Name: 'tag:Application', Values: ['github-action-runner'] },
        { Name: 'instance-state-name', Values: ['running', 'pending'] },
        { Name: 'tag:Repo', Values: [REPO_NAME] },
      ],
    });
  });

  it('filters instances on org name', async () => {
    await listRunners({ runnerType: 'Org', runnerOwner: ORG_NAME, environment: undefined });
    expect(mockEC2.describeInstances).toBeCalledWith({
      Filters: [
        { Name: 'tag:Application', Values: ['github-action-runner'] },
        { Name: 'instance-state-name', Values: ['running', 'pending'] },
        { Name: 'tag:Org', Values: [ORG_NAME] },
      ],
    });
  });

  it('filters instances on org name', async () => {
    await listRunners({ environment: ENVIRONMENT });
    expect(mockEC2.describeInstances).toBeCalledWith({
      Filters: [
        { Name: 'tag:Application', Values: ['github-action-runner'] },
        { Name: 'instance-state-name', Values: ['running', 'pending'] },
        { Name: 'tag:Environment', Values: [ENVIRONMENT] },
      ],
    });
  });
});

describe('create runner', () => {
  const mockRunInstances = { promise: jest.fn() };
  const mockPutParameter = { promise: jest.fn() };
  beforeEach(() => {
    jest.clearAllMocks();
    mockEC2.runInstances.mockImplementation(() => mockRunInstances);
    mockRunInstances.promise.mockReturnValue({
      Instances: [
        {
          InstanceId: 'i-1234',
        },
      ],
    });
    mockSSM.putParameter.mockImplementation(() => mockPutParameter);
    process.env.SUBNET_IDS = 'sub-1234';
  });

  it('calls run instances with the correct config for repo', async () => {
    await createRunner(
      {
        runnerServiceConfig: 'bla',
        environment: ENVIRONMENT,
        runnerType: 'Repo',
        runnerOwner: REPO_NAME,
      },
      LAUNCH_TEMPLATE,
    );
    expect(mockEC2.runInstances).toBeCalledWith({
      MaxCount: 1,
      MinCount: 1,
      LaunchTemplate: { LaunchTemplateName: LAUNCH_TEMPLATE, Version: '$Default' },
      SubnetId: 'sub-1234',
      TagSpecifications: [
        {
          ResourceType: 'instance',
          Tags: [
            { Key: 'Application', Value: 'github-action-runner' },
            { Key: 'Repo', Value: REPO_NAME },
          ],
        },
      ],
    });
  });

  it('calls run instances with the correct config for org', async () => {
    await createRunner(
      {
        runnerServiceConfig: 'bla',
        environment: ENVIRONMENT,
        runnerType: 'Org',
        runnerOwner: ORG_NAME,
      },
      LAUNCH_TEMPLATE,
    );
    expect(mockEC2.runInstances).toBeCalledWith({
      MaxCount: 1,
      MinCount: 1,
      LaunchTemplate: { LaunchTemplateName: LAUNCH_TEMPLATE, Version: '$Default' },
      SubnetId: 'sub-1234',
      TagSpecifications: [
        {
          ResourceType: 'instance',
          Tags: [
            { Key: 'Application', Value: 'github-action-runner' },
            { Key: 'Org', Value: ORG_NAME },
          ],
        },
      ],
    });
  });

  it('creates ssm parameters for each created instance', async () => {
    await createRunner(
      {
        runnerServiceConfig: 'bla',
        environment: ENVIRONMENT,
        runnerType: 'Org',
        runnerOwner: ORG_NAME,
      },
      LAUNCH_TEMPLATE,
    );
    expect(mockSSM.putParameter).toBeCalledWith({
      Name: `${ENVIRONMENT}-i-1234`,
      Value: 'bla',
      Type: 'SecureString',
    });
  });

  it('does not create ssm parameters when no instance is created', async () => {
    mockRunInstances.promise.mockReturnValue({
      Instances: [],
    });
    await createRunner(
      {
        runnerServiceConfig: 'bla',
        environment: ENVIRONMENT,
        runnerType: 'Org',
        runnerOwner: ORG_NAME,
      },
      LAUNCH_TEMPLATE,
    );
    expect(mockSSM.putParameter).not.toBeCalled();
  });
});
