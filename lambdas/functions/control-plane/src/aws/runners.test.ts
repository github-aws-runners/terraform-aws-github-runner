import {
  CreateFleetCommand,
  CreateFleetCommandInput,
  CreateFleetInstance,
  CreateFleetResult,
  CreateTagsCommand,
  DeleteTagsCommand,
  DefaultTargetCapacityType,
  DescribeInstancesCommand,
  DescribeInstancesResult,
  EC2Client,
  SpotAllocationStrategy,
  TerminateInstancesCommand,
} from '@aws-sdk/client-ec2';
import { GetParameterCommand, GetParameterResult, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { tracer } from '@aws-github-runner/aws-powertools-util';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';

import ScaleError from './../scale-runners/ScaleError';
import { createRunner, listEC2Runners, tag, untag, terminateRunner } from './runners';
import { RunnerInfo, RunnerInputParameters, RunnerType } from './runners.d';
import { describe, it, expect, beforeEach, vi } from 'vitest';

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
const mockRunningInstancesJit: DescribeInstancesResult = {
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
            { Key: 'ghr:github_runner_id', Value: '9876543210' },
          ],
        },
      ],
    },
  ],
};

describe('list instances', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns a list of instances (Non JIT)', async () => {
    mockEC2Client.on(DescribeInstancesCommand).resolves(mockRunningInstances);
    const resp = await listEC2Runners();
    expect(resp.length).toBe(1);
    expect(resp).toContainEqual({
      instanceId: 'i-1234',
      launchTime: new Date('2020-10-10T14:48:00.000+09:00'),
      type: 'Org',
      owner: 'CoderToCat',
      orphan: false,
    });
  });

  it('returns a list of instances (JIT)', async () => {
    mockEC2Client.on(DescribeInstancesCommand).resolves(mockRunningInstancesJit);
    const resp = await listEC2Runners();
    expect(resp.length).toBe(1);
    expect(resp).toContainEqual({
      instanceId: 'i-1234',
      launchTime: new Date('2020-10-10T14:48:00.000+09:00'),
      type: 'Org',
      owner: 'CoderToCat',
      orphan: false,
      runnerId: '9876543210',
    });
  });

  it('check orphan tag.', async () => {
    const instances: DescribeInstancesResult = mockRunningInstances;
    instances.Reservations![0].Instances![0].Tags!.push({ Key: 'ghr:orphan', Value: 'true' });
    mockEC2Client.on(DescribeInstancesCommand).resolves(instances);

    const resp = await listEC2Runners();
    expect(resp.length).toBe(1);
    expect(resp).toContainEqual({
      instanceId: instances.Reservations![0].Instances![0].InstanceId!,
      launchTime: instances.Reservations![0].Instances![0].LaunchTime!,
      type: 'Org',
      owner: 'CoderToCat',
      orphan: true,
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

  it('filters instances on environment and orphan', async () => {
    mockRunningInstances.Reservations![0].Instances![0].Tags!.push({
      Key: 'ghr:orphan',
      Value: 'true',
    });
    mockEC2Client.on(DescribeInstancesCommand).resolves(mockRunningInstances);
    await listEC2Runners({ environment: ENVIRONMENT, orphan: true });
    expect(mockEC2Client).toHaveReceivedCommandWith(DescribeInstancesCommand, {
      Filters: [
        { Name: 'instance-state-name', Values: ['running', 'pending'] },
        { Name: 'tag:ghr:environment', Values: [ENVIRONMENT] },
        { Name: 'tag:ghr:orphan', Values: ['true'] },
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

  it('Filter instances for state running.', async () => {
    mockEC2Client.on(DescribeInstancesCommand).resolves(mockRunningInstances);
    await listEC2Runners({ statuses: ['running'] });
    expect(mockEC2Client).toHaveReceivedCommandWith(DescribeInstancesCommand, {
      Filters: [
        { Name: 'instance-state-name', Values: ['running'] },
        { Name: 'tag:ghr:Application', Values: ['github-action-runner'] },
      ],
    });
  });

  it('Filter instances with status undefined, fall back to defaults.', async () => {
    mockEC2Client.on(DescribeInstancesCommand).resolves(mockRunningInstances);
    await listEC2Runners({ statuses: undefined });
    expect(mockEC2Client).toHaveReceivedCommandWith(DescribeInstancesCommand, {
      Filters: [
        { Name: 'instance-state-name', Values: ['running', 'pending'] },
        { Name: 'tag:ghr:Application', Values: ['github-action-runner'] },
      ],
    });
  });
});

describe('terminate runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

describe('tag runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('adding extra tag', async () => {
    mockEC2Client.on(CreateTagsCommand).resolves({});
    const runner: RunnerInfo = {
      instanceId: 'instance-2',
      owner: 'owner-2',
      type: 'Repo',
    };
    await tag(runner.instanceId, [{ Key: 'ghr:orphan', Value: 'true' }]);

    expect(mockEC2Client).toHaveReceivedCommandWith(CreateTagsCommand, {
      Resources: [runner.instanceId],
      Tags: [{ Key: 'ghr:orphan', Value: 'true' }],
    });
  });
});

describe('untag runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('removing extra tag', async () => {
    mockEC2Client.on(DeleteTagsCommand).resolves({});
    const runner: RunnerInfo = {
      instanceId: 'instance-2',
      owner: 'owner-2',
      type: 'Repo',
    };
    await tag(runner.instanceId, [{ Key: 'ghr:orphan', Value: 'true' }]);
    expect(mockEC2Client).toHaveReceivedCommandWith(CreateTagsCommand, {
      Resources: [runner.instanceId],
      Tags: [{ Key: 'ghr:orphan', Value: 'true' }],
    });
    await untag(runner.instanceId, [{ Key: 'ghr:orphan', Value: 'true' }]);
    expect(mockEC2Client).toHaveReceivedCommandWith(DeleteTagsCommand, {
      Resources: [runner.instanceId],
      Tags: [{ Key: 'ghr:orphan', Value: 'true' }],
    });
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
    vi.clearAllMocks();
    mockEC2Client.reset();
    mockSSMClient.reset();

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
  it('calls create fleet of 1 instance with runner tracing enabled', async () => {
    tracer.getRootXrayTraceId = vi.fn().mockReturnValue('123');

    await createRunner(createRunnerConfig({ ...defaultRunnerConfig, tracingEnabled: true }));

    expect(mockEC2Client).toHaveReceivedCommandWith(CreateFleetCommand, {
      ...expectedCreateFleetRequest({ ...defaultExpectedFleetRequestValues, tracingEnabled: true }),
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
    vi.clearAllMocks();
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

    await expect(createRunner(createRunnerConfig(defaultRunnerConfig))).resolves.toEqual(['i-123']);
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

  it('Error with undefined Instances and Errors.', async () => {
    mockEC2Client.on(CreateFleetCommand).resolvesOnce({ Instances: undefined, Errors: undefined });
    await expect(createRunner(createRunnerConfig(defaultRunnerConfig))).rejects.toBeInstanceOf(Error);
  });

  it('Error with undefined InstanceIds and ErrorCode.', async () => {
    mockEC2Client.on(CreateFleetCommand).resolvesOnce({
      Instances: [{ InstanceIds: undefined }],
      Errors: [
        {
          ErrorCode: undefined,
        },
      ],
    });
    await expect(createRunner(createRunnerConfig(defaultRunnerConfig))).rejects.toBeInstanceOf(Error);
  });
});

describe('create runner with errors fail over to OnDemand', () => {
  const defaultRunnerConfig: RunnerConfig = {
    allocationStrategy: SpotAllocationStrategy.CAPACITY_OPTIMIZED,
    capacityType: 'spot',
    type: 'Repo',
    onDemandFailoverOnError: ['InsufficientInstanceCapacity'],
  };
  const defaultExpectedFleetRequestValues: ExpectedFleetRequestValues = {
    type: 'Repo',
    capacityType: 'spot',
    allocationStrategy: SpotAllocationStrategy.CAPACITY_OPTIMIZED,
    totalTargetCapacity: 1,
  };
  beforeEach(() => {
    vi.clearAllMocks();
    mockEC2Client.reset();
    mockSSMClient.reset();

    mockSSMClient.on(PutParameterCommand).resolves({});
    mockSSMClient.on(GetParameterCommand).resolves({});
    mockEC2Client.on(CreateFleetCommand).resolves({ Instances: [] });
  });

  it('test InsufficientInstanceCapacity fallback to on demand .', async () => {
    const instancesIds = ['i-123'];
    createFleetMockWithWithOnDemandFallback(['InsufficientInstanceCapacity'], instancesIds);

    const instancesResult = await createRunner(createRunnerConfig(defaultRunnerConfig));
    expect(instancesResult).toEqual(instancesIds);

    expect(mockEC2Client).toHaveReceivedCommandTimes(CreateFleetCommand, 2);

    // first call with spot failuer
    expect(mockEC2Client).toHaveReceivedNthCommandWith(1, CreateFleetCommand, {
      ...expectedCreateFleetRequest({
        ...defaultExpectedFleetRequestValues,
        totalTargetCapacity: 1,
        capacityType: 'spot',
      }),
    });

    // second call with with OnDemand failback
    expect(mockEC2Client).toHaveReceivedNthCommandWith(2, CreateFleetCommand, {
      ...expectedCreateFleetRequest({
        ...defaultExpectedFleetRequestValues,
        totalTargetCapacity: 1,
        capacityType: 'on-demand',
      }),
    });
  });

  it('test InsufficientInstanceCapacity no failback.', async () => {
    await expect(
      createRunner(createRunnerConfig({ ...defaultRunnerConfig, onDemandFailoverOnError: [] })),
    ).rejects.toBeInstanceOf(Error);
  });

  it('test InsufficientInstanceCapacity with mutlipte instances and fallback to on demand .', async () => {
    const instancesIds = ['i-123', 'i-456'];
    createFleetMockWithWithOnDemandFallback(['InsufficientInstanceCapacity'], instancesIds);

    const instancesResult = await createRunner({ ...createRunnerConfig(defaultRunnerConfig), numberOfRunners: 2 });
    expect(instancesResult).toEqual(instancesIds);

    expect(mockEC2Client).toHaveReceivedCommandTimes(CreateFleetCommand, 2);

    // first call with spot failuer
    expect(mockEC2Client).toHaveReceivedNthCommandWith(1, CreateFleetCommand, {
      ...expectedCreateFleetRequest({
        ...defaultExpectedFleetRequestValues,
        totalTargetCapacity: 2,
        capacityType: 'spot',
      }),
    });

    // second call with with OnDemand failback, capacity is reduced by 1
    expect(mockEC2Client).toHaveReceivedNthCommandWith(2, CreateFleetCommand, {
      ...expectedCreateFleetRequest({
        ...defaultExpectedFleetRequestValues,
        totalTargetCapacity: 1,
        capacityType: 'on-demand',
      }),
    });
  });

  it('test UnfulfillableCapacity with mutlipte instances and no fallback to on demand .', async () => {
    const instancesIds = ['i-123', 'i-456'];
    // fallback to on demand for UnfulfillableCapacity but InsufficientInstanceCapacity is thrown
    createFleetMockWithWithOnDemandFallback(['UnfulfillableCapacity'], instancesIds);

    await expect(
      createRunner({ ...createRunnerConfig(defaultRunnerConfig), numberOfRunners: 2 }),
    ).rejects.toBeInstanceOf(Error);

    expect(mockEC2Client).toHaveReceivedCommandTimes(CreateFleetCommand, 1);

    // first call with spot failuer
    expect(mockEC2Client).toHaveReceivedNthCommandWith(1, CreateFleetCommand, {
      ...expectedCreateFleetRequest({
        ...defaultExpectedFleetRequestValues,
        totalTargetCapacity: 2,
        capacityType: 'spot',
      }),
    });
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

function createFleetMockWithWithOnDemandFallback(errors: string[], instances?: string[], numberOfFailures = 1) {
  const instanceesFirstCall: CreateFleetInstance = {
    InstanceIds: instances?.slice(0, instances.length - numberOfFailures).map((i) => i),
  };

  const instancesSecondCall: CreateFleetInstance = {
    InstanceIds: instances?.slice(instances.length - numberOfFailures, instances.length).map((i) => i),
  };

  mockEC2Client
    .on(CreateFleetCommand)
    .resolvesOnce({ Instances: [instanceesFirstCall], Errors: errors.map((e) => ({ ErrorCode: e })) })
    .resolvesOnce({ Instances: [instancesSecondCall] });
}

interface RunnerConfig {
  type: RunnerType;
  capacityType: DefaultTargetCapacityType;
  allocationStrategy: SpotAllocationStrategy;
  maxSpotPrice?: string;
  amiIdSsmParameterName?: string;
  tracingEnabled?: boolean;
  onDemandFailoverOnError?: string[];
}

function createRunnerConfig(runnerConfig: RunnerConfig): RunnerInputParameters {
  return {
    environment: ENVIRONMENT,
    runnerType: runnerConfig.type,
    runnerOwner: REPO_NAME,
    numberOfRunners: 1,
    launchTemplateName: LAUNCH_TEMPLATE,
    ec2instanceCriteria: {
      instanceTypes: ['m5.large', 'c5.large'],
      targetCapacityType: runnerConfig.capacityType,
      maxSpotPrice: runnerConfig.maxSpotPrice,
      instanceAllocationStrategy: runnerConfig.allocationStrategy,
    },
    subnets: ['subnet-123', 'subnet-456'],
    amiIdSsmParameterName: runnerConfig.amiIdSsmParameterName,
    tracingEnabled: runnerConfig.tracingEnabled,
    onDemandFailoverOnError: runnerConfig.onDemandFailoverOnError,
  };
}

interface ExpectedFleetRequestValues {
  type: 'Repo' | 'Org';
  capacityType: DefaultTargetCapacityType;
  allocationStrategy: SpotAllocationStrategy;
  maxSpotPrice?: string;
  totalTargetCapacity: number;
  imageId?: string;
  tracingEnabled?: boolean;
}

function expectedCreateFleetRequest(expectedValues: ExpectedFleetRequestValues): CreateFleetCommandInput {
  const tags = [
    { Key: 'ghr:Application', Value: 'github-action-runner' },
    { Key: 'ghr:created_by', Value: expectedValues.totalTargetCapacity > 1 ? 'pool-lambda' : 'scale-up-lambda' },
    { Key: 'ghr:Type', Value: expectedValues.type },
    { Key: 'ghr:Owner', Value: REPO_NAME },
  ];
  if (expectedValues.tracingEnabled) {
    const traceId = tracer.getRootXrayTraceId();
    tags.push({ Key: 'ghr:trace_id', Value: traceId! });
  }
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
    for (const config of request?.LaunchTemplateConfigs ?? []) {
      if (config.Overrides) {
        for (const override of config.Overrides) {
          override.ImageId = expectedValues.imageId;
        }
      }
    }
  }

  return request;
}
