import {
  CancelSpotInstanceRequestsCommand,
  CreateTagsCommand,
  DescribeInstancesCommand,
  type DescribeInstancesResult,
  DescribeLaunchTemplateVersionsCommand,
  DescribeSpotInstanceRequestsCommand,
  EC2Client,
  type Instance,
  RunInstancesCommand,
  type RunInstancesCommandInput,
  StartInstancesCommand,
  TerminateInstancesCommand,
} from '@aws-sdk/client-ec2';
import { getParameter } from '@aws-github-runner/aws-ssm-util';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ec2SdkError } from '../../../test/aws-sdk-errors';
import {
  classifyStandbyInstance,
  createEc2StandbyClient,
  type Ec2WarmLaunchParameters,
  instanceArn,
  type StandbyClassificationInput,
  WARM_EXPIRY_MARGIN_HOURS,
} from './standby';

vi.mock('@aws-github-runner/aws-ssm-util', () => ({ getParameter: vi.fn() }));

process.env.AWS_REGION = 'eu-east-1';
const mockEC2Client = mockClient(EC2Client);
const childLoggers = vi.hoisted(() => new Map<string, { info: (...args: unknown[]) => void }>());

vi.mock('@aws-github-runner/aws-powertools-util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-github-runner/aws-powertools-util')>();
  return {
    ...actual,
    createChildLogger: (module: string) => {
      const child = actual.createChildLogger(module);
      childLoggers.set(module, child);
      return child;
    },
  };
});
const standby = createEc2StandbyClient(new EC2Client({})).forRequest({ signal: undefined });

const NOW = new Date('2026-09-30T12:00:00.000Z');
const FILTERS = { environment: 'unit-test', runnerType: 'Org' as const, runnerOwner: 'CoderToCat' };
const EXPECTED_TAG_FILTERS = [
  { Name: 'tag:ghr:Application', Values: ['github-action-runner'] },
  { Name: 'tag:ghr:environment', Values: ['unit-test'] },
  { Name: 'tag:ghr:Type', Values: ['Org'] },
  { Name: 'tag:ghr:Owner', Values: ['CoderToCat'] },
  { Name: 'tag:ghr:warm-pool', Values: ['true'] },
];

function awsError(name: string): Error {
  return Object.assign(new Error(name), { name });
}

function describeResult(instances: Instance[]): DescribeInstancesResult {
  return { Reservations: [{ Instances: instances }] };
}

function sentCommandNames(): string[] {
  return mockEC2Client.calls().map((call) => (call.args[0] as object).constructor.name);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEC2Client.reset();
});

describe('destroyInstance', () => {
  beforeEach(() => {
    mockEC2Client.on(CancelSpotInstanceRequestsCommand).resolves({});
    mockEC2Client.on(TerminateInstancesCommand).resolves({});
  });

  it('terminates an on-demand instance without cancelling a spot request', async () => {
    mockEC2Client.on(DescribeInstancesCommand).resolves(describeResult([{ InstanceId: 'i-ondemand' }]));

    await standby.destroyInstance({ instanceId: 'i-ondemand' });

    expect(mockEC2Client).toHaveReceivedCommandWith(DescribeInstancesCommand, { InstanceIds: ['i-ondemand'] });
    expect(mockEC2Client).not.toHaveReceivedCommand(CancelSpotInstanceRequestsCommand);
    expect(mockEC2Client).toHaveReceivedCommandWith(TerminateInstancesCommand, { InstanceIds: ['i-ondemand'] });
  });

  it('looks up and cancels the spot request of a running spot instance before terminating', async () => {
    mockEC2Client
      .on(DescribeInstancesCommand)
      .resolves(
        describeResult([
          { InstanceId: 'i-running', SpotInstanceRequestId: 'sir-running', State: { Name: 'running', Code: 16 } },
        ]),
      );

    await standby.destroyInstance({ instanceId: 'i-running' });

    expect(mockEC2Client).toHaveReceivedCommandWith(CancelSpotInstanceRequestsCommand, {
      SpotInstanceRequestIds: ['sir-running'],
    });
    expect(sentCommandNames()).toEqual([
      'DescribeInstancesCommand',
      'CancelSpotInstanceRequestsCommand',
      'TerminateInstancesCommand',
    ]);
  });

  it('cancels a known spot request of a stopped instance before terminating without a lookup', async () => {
    await standby.destroyInstance({ instanceId: 'i-stopped', spotInstanceRequestId: 'sir-stopped' });

    expect(mockEC2Client).not.toHaveReceivedCommand(DescribeInstancesCommand);
    expect(sentCommandNames()).toEqual(['CancelSpotInstanceRequestsCommand', 'TerminateInstancesCommand']);
    expect(mockEC2Client).toHaveReceivedCommandWith(TerminateInstancesCommand, { InstanceIds: ['i-stopped'] });
  });

  it('terminates when the spot request is already closed', async () => {
    mockEC2Client.on(CancelSpotInstanceRequestsCommand).resolves({
      CancelledSpotInstanceRequests: [{ SpotInstanceRequestId: 'sir-closed', State: 'closed' }],
    });

    await standby.destroyInstance({ instanceId: 'i-closed', spotInstanceRequestId: 'sir-closed' });

    expect(sentCommandNames()).toEqual(['CancelSpotInstanceRequestsCommand', 'TerminateInstancesCommand']);
  });

  it('tolerates a spot request that no longer exists and still terminates', async () => {
    mockEC2Client.on(CancelSpotInstanceRequestsCommand).rejects(awsError('InvalidSpotInstanceRequestID.NotFound'));

    await standby.destroyInstance({ instanceId: 'i-gone', spotInstanceRequestId: 'sir-gone' });

    expect(sentCommandNames()).toEqual(['CancelSpotInstanceRequestsCommand', 'TerminateInstancesCommand']);
  });

  it('does not terminate when cancelling the spot request fails', async () => {
    mockEC2Client.on(CancelSpotInstanceRequestsCommand).rejects(awsError('RequestLimitExceeded'));

    await expect(standby.destroyInstance({ instanceId: 'i-spot', spotInstanceRequestId: 'sir-spot' })).rejects.toThrow(
      'RequestLimitExceeded',
    );

    expect(mockEC2Client).not.toHaveReceivedCommand(TerminateInstancesCommand);
  });

  it('does not send requests once the request signal is aborted', async () => {
    const abortController = new AbortController();
    const operations = createEc2StandbyClient(new EC2Client({})).forRequest({ signal: abortController.signal });
    abortController.abort(new Error('service stopping'));

    await expect(operations.destroyInstance({ instanceId: 'i-1' })).rejects.toThrow('service stopping');

    expect(mockEC2Client.calls()).toHaveLength(0);
  });
});

describe('launchWarm', () => {
  const baseParameters: Ec2WarmLaunchParameters = {
    environment: 'unit-test',
    runnerType: 'Org',
    runnerOwner: 'CoderToCat',
    subnets: ['subnet-a', 'subnet-b'],
    launchTemplateName: 'lt-1',
    ec2instanceCriteria: {
      instanceTypes: ['m5.large', 'c5.large'],
      targetCapacityType: 'on-demand',
      instanceAllocationStrategy: 'lowest-price',
    },
    numberOfRunners: 1,
    source: 'pool-lambda',
    maxAgeHours: 12,
  };
  const expiresAt = new Date(NOW.getTime() + (12 + WARM_EXPIRY_MARGIN_HOURS) * 60 * 60 * 1000);
  const expectedTags = [
    { Key: 'ghr:Application', Value: 'github-action-runner' },
    { Key: 'ghr:created_by', Value: 'pool-lambda' },
    { Key: 'ghr:environment', Value: 'unit-test' },
    { Key: 'ghr:Type', Value: 'Org' },
    { Key: 'ghr:Owner', Value: 'CoderToCat' },
    { Key: 'ghr:warm-pool', Value: 'true' },
    { Key: 'ghr:warm-expires-at', Value: expiresAt.toISOString() },
  ];

  function runInstancesInputs(): RunInstancesCommandInput[] {
    return mockEC2Client.commandCalls(RunInstancesCommand).map((call) => call.args[0].input);
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    mockEC2Client.on(RunInstancesCommand).resolves({ Instances: [{ InstanceId: 'i-warm' }] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('launches on-demand warm instances that stop on shutdown without market options', async () => {
    const result = await standby.launchWarm(baseParameters);

    expect(result).toEqual({ instances: ['i-warm'], failedInstanceCount: 0, failureCodes: [], spotRequests: [] });
    expect(runInstancesInputs()).toEqual([
      {
        LaunchTemplate: { LaunchTemplateName: 'lt-1', Version: '$Default' },
        InstanceType: 'm5.large',
        SubnetId: 'subnet-a',
        MinCount: 1,
        MaxCount: 1,
        InstanceInitiatedShutdownBehavior: 'stop',
        TagSpecifications: [
          { ResourceType: 'instance', Tags: expectedTags },
          { ResourceType: 'volume', Tags: expectedTags },
        ],
      },
    ]);
  });

  it('does not tag the pool trace on warm instances', async () => {
    await standby.launchWarm({ ...baseParameters, tracingEnabled: true });

    expect(runInstancesInputs()[0].TagSpecifications?.[0].Tags).toEqual(expectedTags);
  });

  it('launches spot warm instances as persistent requests with tagged spot requests', async () => {
    vi.mocked(getParameter).mockResolvedValue('ami-123');

    await standby.launchWarm({
      ...baseParameters,
      amiIdSsmParameterName: '/ami',
      ec2instanceCriteria: { ...baseParameters.ec2instanceCriteria, targetCapacityType: 'spot', maxSpotPrice: '0.5' },
    });

    expect(getParameter).toHaveBeenCalledWith('/ami');
    expect(runInstancesInputs()).toEqual([
      {
        LaunchTemplate: { LaunchTemplateName: 'lt-1', Version: '$Default' },
        InstanceType: 'm5.large',
        SubnetId: 'subnet-a',
        ImageId: 'ami-123',
        MinCount: 1,
        MaxCount: 1,
        InstanceInitiatedShutdownBehavior: 'stop',
        InstanceMarketOptions: {
          MarketType: 'spot',
          SpotOptions: {
            SpotInstanceType: 'persistent',
            InstanceInterruptionBehavior: 'stop',
            ValidUntil: expiresAt,
            MaxPrice: '0.5',
          },
        },
        TagSpecifications: [
          { ResourceType: 'instance', Tags: expectedTags },
          { ResourceType: 'volume', Tags: expectedTags },
          { ResourceType: 'spot-instances-request', Tags: expectedTags },
        ],
      },
    ]);
  });

  describe('spot request binding', () => {
    const spotLaunch = {
      ...baseParameters,
      numberOfRunners: 2,
      ec2instanceCriteria: { ...baseParameters.ec2instanceCriteria, targetCapacityType: 'spot' as const },
    };

    beforeEach(() => {
      let launched = 0;
      mockEC2Client.on(RunInstancesCommand).callsFake((input: RunInstancesCommandInput) => ({
        OwnerId: '123456789012',
        Instances: Array.from({ length: input.MaxCount ?? 1 }, () => {
          launched++;
          return { InstanceId: `i-${launched}`, SpotInstanceRequestId: `sir-${launched}` };
        }),
      }));
    });

    it('tags each spot request with the ARN of its instance', async () => {
      const result = await standby.launchWarm(spotLaunch);

      expect(result.spotRequests).toEqual([
        {
          instanceId: 'i-1',
          spotInstanceRequestId: 'sir-1',
          instanceArn: 'arn:aws:ec2:eu-east-1:123456789012:instance/i-1',
          bound: true,
        },
        {
          instanceId: 'i-2',
          spotInstanceRequestId: 'sir-2',
          instanceArn: 'arn:aws:ec2:eu-east-1:123456789012:instance/i-2',
          bound: true,
        },
      ]);
      expect(mockEC2Client).toHaveReceivedCommandWith(CreateTagsCommand, {
        Resources: ['sir-1'],
        Tags: [{ Key: 'ghr:instance-arn', Value: 'arn:aws:ec2:eu-east-1:123456789012:instance/i-1' }],
      });
      expect(mockEC2Client).toHaveReceivedCommandTimes(CreateTagsCommand, 2);
    });

    it('still reports the launch when a binding fails', async () => {
      mockEC2Client.on(CreateTagsCommand).rejectsOnce(awsError('RequestLimitExceeded')).resolves({});

      const result = await standby.launchWarm(spotLaunch);

      expect(result.instances).toEqual(['i-1', 'i-2']);
      expect(result.spotRequests.map(({ instanceId, bound }) => [instanceId, bound])).toEqual([
        ['i-1', false],
        ['i-2', true],
      ]);
    });

    it('does not bind without the account of the instance', async () => {
      mockEC2Client
        .on(RunInstancesCommand)
        .resolves({ Instances: [{ InstanceId: 'i-1', SpotInstanceRequestId: 'sir-1' }] });

      const result = await standby.launchWarm({ ...spotLaunch, numberOfRunners: 1 });

      expect(result.spotRequests).toEqual([
        { instanceId: 'i-1', spotInstanceRequestId: 'sir-1', instanceArn: undefined, bound: false },
      ]);
      expect(mockEC2Client).not.toHaveReceivedCommand(CreateTagsCommand);
    });

    it('binds a request later through the standby operations', async () => {
      await standby.bindSpotRequest({
        instanceId: 'i-1',
        spotInstanceRequestId: 'sir-1',
        instanceArn: 'arn:aws:ec2:eu-east-1:123456789012:instance/i-1',
      });

      expect(mockEC2Client).toHaveReceivedCommandWith(CreateTagsCommand, {
        Resources: ['sir-1'],
        Tags: [{ Key: 'ghr:instance-arn', Value: 'arn:aws:ec2:eu-east-1:123456789012:instance/i-1' }],
      });
      await expect(standby.bindSpotRequest({ instanceId: 'i-1', spotInstanceRequestId: 'sir-1' })).rejects.toThrow(
        "The ARN of instance 'i-1' is unknown.",
      );
    });

    it.each([
      ['eu-west-1', 'arn:aws:ec2:eu-west-1:123456789012:instance/i-1'],
      ['cn-north-1', 'arn:aws-cn:ec2:cn-north-1:123456789012:instance/i-1'],
      ['us-gov-west-1', 'arn:aws-us-gov:ec2:us-gov-west-1:123456789012:instance/i-1'],
    ])('builds the instance ARN in %s', (region, arn) => {
      expect(instanceArn(region, '123456789012', 'i-1')).toBe(arn);
      expect(instanceArn(region, undefined, 'i-1')).toBeUndefined();
    });
  });

  it('launches every requested instance with the first instance type and subnet when capacity is available', async () => {
    mockEC2Client.on(RunInstancesCommand).resolves({ Instances: [{ InstanceId: 'i-1' }, { InstanceId: 'i-2' }] });

    const result = await standby.launchWarm({ ...baseParameters, numberOfRunners: 2 });

    expect(result).toEqual({ instances: ['i-1', 'i-2'], failedInstanceCount: 0, failureCodes: [], spotRequests: [] });
    expect(runInstancesInputs()).toHaveLength(1);
    expect(runInstancesInputs()[0]).toMatchObject({ MinCount: 1, MaxCount: 2 });
  });

  it('falls back across subnets and then instance types on capacity errors', async () => {
    mockEC2Client
      .on(RunInstancesCommand)
      .rejectsOnce(awsError('InsufficientInstanceCapacity'))
      .rejectsOnce(awsError('Unsupported'))
      .resolvesOnce({ Instances: [{ InstanceId: 'i-fallback' }] });

    const result = await standby.launchWarm(baseParameters);

    expect(result).toEqual({ instances: ['i-fallback'], failedInstanceCount: 0, failureCodes: [], spotRequests: [] });
    expect(runInstancesInputs().map((input) => [input.InstanceType, input.SubnetId])).toEqual([
      ['m5.large', 'subnet-a'],
      ['m5.large', 'subnet-b'],
      ['c5.large', 'subnet-a'],
    ]);
  });

  it('falls back on a capacity error as the installed SDK deserializes it', async () => {
    mockEC2Client
      .on(RunInstancesCommand)
      .rejectsOnce(await ec2SdkError('InsufficientInstanceCapacity', 'No m5.large capacity.', 500))
      .resolvesOnce({ Instances: [{ InstanceId: 'i-fallback' }] });

    const result = await standby.launchWarm(baseParameters);

    expect(result.instances).toEqual(['i-fallback']);
    expect(runInstancesInputs().map((input) => [input.InstanceType, input.SubnetId])).toEqual([
      ['m5.large', 'subnet-a'],
      ['m5.large', 'subnet-b'],
    ]);
  });

  it('requests the remainder from the next candidate after a partial launch', async () => {
    mockEC2Client
      .on(RunInstancesCommand)
      .resolvesOnce({ Instances: [{ InstanceId: 'i-1' }] })
      .resolvesOnce({ Instances: [{ InstanceId: 'i-2' }, { InstanceId: 'i-3' }] });

    const result = await standby.launchWarm({ ...baseParameters, numberOfRunners: 3 });

    expect(result.instances).toEqual(['i-1', 'i-2', 'i-3']);
    expect(runInstancesInputs().map((input) => input.MaxCount)).toEqual([3, 2]);
  });

  it('reports every instance as failed when all candidates lack capacity', async () => {
    mockEC2Client.on(RunInstancesCommand).rejects(awsError('SpotMaxPriceTooLow'));

    const result = await standby.launchWarm({ ...baseParameters, numberOfRunners: 2 });

    expect(result).toEqual({
      instances: [],
      failedInstanceCount: 2,
      failureCodes: ['aws-name:SpotMaxPriceTooLow'],
      spotRequests: [],
    });
    expect(runInstancesInputs()).toHaveLength(4);
  });

  it('stops falling back on a non-capacity error', async () => {
    mockEC2Client.on(RunInstancesCommand).rejects(awsError('UnauthorizedOperation'));

    const result = await standby.launchWarm(baseParameters);

    expect(result).toEqual({
      instances: [],
      failedInstanceCount: 1,
      failureCodes: ['aws-name:UnauthorizedOperation'],
      spotRequests: [],
    });
    expect(runInstancesInputs()).toHaveLength(1);
  });

  it('tries on-demand instance types in priority order for prioritized', async () => {
    await standby.launchWarm({
      ...baseParameters,
      ec2instanceCriteria: {
        ...baseParameters.ec2instanceCriteria,
        instanceAllocationStrategy: 'prioritized',
        instanceTypePriorities: { 'm5.large': 2, 'c5.large': 1 },
      },
    });

    expect(runInstancesInputs().map((input) => [input.InstanceType, input.SubnetId])).toEqual([
      ['c5.large', 'subnet-a'],
    ]);
  });

  describe('spot placement', () => {
    const spotParameters: Ec2WarmLaunchParameters = {
      ...baseParameters,
      subnets: ['subnet-a', 'subnet-b', 'subnet-c'],
      ec2instanceCriteria: {
        instanceTypes: ['m5.large', 'c5.large'],
        targetCapacityType: 'spot',
        instanceAllocationStrategy: 'capacity-optimized',
      },
      placement: {
        source: 'fresh',
        subnetAzIds: { 'subnet-a': 'az1', 'subnet-b': 'az2', 'subnet-c': 'az3' },
        signals: { azScores: { az1: 2, az2: 9, az3: 5 } },
      },
    };
    const launchedPairs = () =>
      runInstancesInputs().map((input) => `${input.InstanceType}@${input.SubnetId}:${input.MaxCount}`);
    let launchedCount = 0;

    beforeEach(() => {
      launchedCount = 0;
      mockEC2Client.on(RunInstancesCommand).callsFake((input: RunInstancesCommandInput) => ({
        Instances: Array.from({ length: input.MaxCount ?? 1 }, () => ({ InstanceId: `i-${++launchedCount}` })),
      }));
    });

    it('spreads a refill over every type and subnet pair in ranked order', async () => {
      const result = await standby.launchWarm({ ...spotParameters, numberOfRunners: 6 });

      expect(result.instances).toHaveLength(6);
      expect(launchedPairs()).toEqual([
        'm5.large@subnet-b:1',
        'c5.large@subnet-b:1',
        'm5.large@subnet-c:1',
        'c5.large@subnet-c:1',
        'm5.large@subnet-a:1',
        'c5.large@subnet-a:1',
      ]);
    });

    it('places a small refill on the highest-ranked pairs', async () => {
      await standby.launchWarm({ ...spotParameters, numberOfRunners: 2 });

      expect(launchedPairs()).toEqual(['m5.large@subnet-b:1', 'c5.large@subnet-b:1']);
    });

    it('deals more than one instance per pair round-robin', async () => {
      await standby.launchWarm({ ...spotParameters, numberOfRunners: 8 });

      expect(launchedPairs().slice(0, 2)).toEqual(['m5.large@subnet-b:2', 'c5.large@subnet-b:2']);
    });

    it('moves the share of a pair without capacity to the next pairs', async () => {
      mockEC2Client
        .on(RunInstancesCommand, { InstanceType: 'm5.large', SubnetId: 'subnet-b' })
        .rejects(await ec2SdkError('InsufficientInstanceCapacity', 'No capacity.', 500));

      const result = await standby.launchWarm({ ...spotParameters, numberOfRunners: 3 });

      expect(result).toEqual({
        instances: ['i-1', 'i-2', 'i-3'],
        failedInstanceCount: 0,
        failureCodes: [],
        spotRequests: [],
      });
      expect(launchedPairs()).toEqual([
        'm5.large@subnet-b:1',
        'c5.large@subnet-b:1',
        'm5.large@subnet-c:1',
        'c5.large@subnet-b:1',
      ]);
    });

    it('requests the missing instances of a partial launch from the remaining pairs', async () => {
      mockEC2Client
        .on(RunInstancesCommand, { InstanceType: 'm5.large', SubnetId: 'subnet-b' })
        .resolves({ Instances: [{ InstanceId: 'i-partial' }] });

      const result = await standby.launchWarm({ ...spotParameters, numberOfRunners: 8 });

      expect(result.instances).toHaveLength(8);
      expect(launchedPairs().slice(6)).toEqual(['c5.large@subnet-b:1']);
    });

    it('stops at a non-capacity error and keeps what launched', async () => {
      mockEC2Client
        .on(RunInstancesCommand, { InstanceType: 'c5.large', SubnetId: 'subnet-b' })
        .rejects(awsError('UnauthorizedOperation'));

      const result = await standby.launchWarm({ ...spotParameters, numberOfRunners: 4 });

      expect(result).toEqual({
        instances: ['i-1'],
        failedInstanceCount: 3,
        failureCodes: ['aws-name:UnauthorizedOperation'],
        spotRequests: [],
      });
      expect(launchedPairs()).toHaveLength(2);
    });

    it('spreads in AZ-interleaved configuration order without signals', async () => {
      await standby.launchWarm({ ...spotParameters, placement: undefined, numberOfRunners: 3 });

      expect(launchedPairs()).toEqual(['m5.large@subnet-a:1', 'm5.large@subnet-b:1', 'm5.large@subnet-c:1']);
    });

    it('logs the placement plan and each launch request', async () => {
      const info = vi.spyOn(childLoggers.get('standby')!, 'info');

      await standby.launchWarm({ ...spotParameters, numberOfRunners: 1 });

      expect(info).toHaveBeenCalledWith(
        'Warm placement plan.',
        expect.objectContaining({
          capacityType: 'spot',
          configuredStrategy: 'capacity-optimized',
          effectiveStrategy: 'capacity-optimized',
          signalSource: 'fresh',
          spread: true,
          requested: 1,
          pairs: expect.arrayContaining([
            { instanceType: 'm5.large', subnetId: 'subnet-b', azId: 'az2', score: 9, price: undefined },
          ]),
        }),
      );
      expect(info).toHaveBeenCalledWith('Warm launch request.', {
        instanceType: 'm5.large',
        subnetId: 'subnet-b',
        azId: 'az2',
        score: 9,
        price: undefined,
        requested: 1,
        launched: 1,
      });
    });

    it('rejects when the request signal is aborted during a launch', async () => {
      const abortController = new AbortController();
      const operations = createEc2StandbyClient(new EC2Client({})).forRequest({ signal: abortController.signal });
      mockEC2Client.on(RunInstancesCommand).callsFake(() => {
        abortController.abort(new Error('service stopping'));
        throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      });

      await expect(operations.launchWarm({ ...spotParameters, numberOfRunners: 2 })).rejects.toThrow();
      expect(runInstancesInputs()).toHaveLength(1);
    });
  });

  it('fails without launching when the AMI parameter cannot be read', async () => {
    vi.mocked(getParameter).mockRejectedValue(awsError('ParameterNotFound'));

    const result = await standby.launchWarm({ ...baseParameters, amiIdSsmParameterName: '/missing' });

    expect(result).toEqual({
      instances: [],
      failedInstanceCount: 1,
      failureCodes: ['aws-name:ParameterNotFound'],
      spotRequests: [],
    });
    expect(mockEC2Client).not.toHaveReceivedCommand(RunInstancesCommand);
  });
});

describe('classifyStandbyInstance', () => {
  const selfStopped = { ec2State: 'stopped', stateReasonCode: 'Client.InstanceInitiatedShutdown', activated: false };

  it.each<[string, StandbyClassificationInput, string]>([
    ['pending on-demand', { ec2State: 'pending', spot: false, activated: false }, 'PRIMING'],
    ['running on-demand', { ec2State: 'running', spot: false, activated: false }, 'PRIMING'],
    ['running spot', { ec2State: 'running', spot: true, spotStatusCode: 'fulfilled', activated: false }, 'PRIMING'],
    ['stopping', { ec2State: 'stopping', spot: false, activated: false }, 'PRIMING'],
    ['self-stopped on-demand', { ...selfStopped, spot: false }, 'WARM'],
    ['self-stopped spot', { ...selfStopped, spot: true, spotStatusCode: 'instance-stopped-by-user' }, 'WARM'],
    ['activated and stopped', { ...selfStopped, spot: false, activated: true }, 'ACTIVE'],
    ['activated and pending', { ec2State: 'pending', spot: true, activated: true }, 'ACTIVE'],
    ['activated and running', { ec2State: 'running', spot: false, activated: true }, 'ACTIVE'],
    [
      'spot interrupted by AWS',
      {
        ec2State: 'stopped',
        stateReasonCode: 'Server.SpotInstanceShutdown',
        spot: true,
        spotStatusCode: 'instance-stopped-by-price',
        activated: false,
      },
      'GARBAGE',
    ],
    [
      'spot stopped for no capacity',
      {
        ec2State: 'stopped',
        stateReasonCode: 'Server.SpotInstanceShutdown',
        spot: true,
        spotStatusCode: 'instance-stopped-no-capacity',
        activated: false,
      },
      'GARBAGE',
    ],
    [
      'self-stopped spot with an unexpected request status',
      { ...selfStopped, spot: true, spotStatusCode: 'instance-stopped-no-capacity' },
      'GARBAGE',
    ],
    [
      'self-stopped spot whose request expired',
      { ...selfStopped, spot: true, spotStatusCode: 'instance-stopped-by-user', spotRequestState: 'cancelled' },
      'GARBAGE',
    ],
    [
      'self-stopped spot with a disabled request',
      { ...selfStopped, spot: true, spotStatusCode: 'instance-stopped-by-user', spotRequestState: 'disabled' },
      'WARM',
    ],
    ['self-stopped spot with unknown request status', { ...selfStopped, spot: true }, 'WARM'],
    [
      'self-stopped spot before the request status catches up',
      { ...selfStopped, spot: true, spotStatusCode: 'fulfilled' },
      'WARM',
    ],
    [
      'on-demand stopped by an operator',
      { ec2State: 'stopped', stateReasonCode: 'Client.UserInitiatedShutdown', spot: false, activated: false },
      'GARBAGE',
    ],
    [
      'spot stopped by an operator',
      {
        ec2State: 'stopped',
        stateReasonCode: 'Client.UserInitiatedShutdown',
        spot: true,
        spotStatusCode: 'instance-stopped-by-user',
        activated: false,
      },
      'GARBAGE',
    ],
    ['stopped without a reason', { ec2State: 'stopped', spot: false, activated: false }, 'GARBAGE'],
    ['unknown state', { spot: false, activated: false }, 'GARBAGE'],
  ])('classifies %s', (_, input, expected) => {
    expect(classifyStandbyInstance(input)).toBe(expected);
  });
});

describe('listStandby', () => {
  it('scans the runner config by tags and classifies from EC2 data only', async () => {
    const launchTime = new Date('2026-09-30T10:00:00.000Z');
    mockEC2Client
      .on(DescribeInstancesCommand)
      .resolvesOnce({
        ...describeResult([
          {
            InstanceId: 'i-warm-spot',
            State: { Name: 'stopped' },
            StateReason: { Code: 'Client.InstanceInitiatedShutdown' },
            SpotInstanceRequestId: 'sir-warm',
            LaunchTime: launchTime,
            ImageId: 'ami-1',
            Tags: [
              { Key: 'aws:ec2launchtemplate:version', Value: '7' },
              { Key: 'ghr:warm-expires-at', Value: '2026-10-01T10:00:00.000Z' },
            ],
          },
        ]),
        NextToken: 'next',
      })
      .resolvesOnce(describeResult([{ InstanceId: 'i-priming', State: { Name: 'running' } }]));

    const result = await standby.listStandby(FILTERS);

    expect(mockEC2Client).toHaveReceivedCommandWith(DescribeInstancesCommand, {
      Filters: [
        { Name: 'instance-state-name', Values: ['pending', 'running', 'stopping', 'stopped'] },
        ...EXPECTED_TAG_FILTERS,
      ],
      NextToken: 'next',
    });
    expect(mockEC2Client).not.toHaveReceivedCommand(DescribeSpotInstanceRequestsCommand);
    expect(result).toEqual([
      {
        instanceId: 'i-warm-spot',
        state: 'WARM',
        launchTime,
        imageId: 'ami-1',
        launchTemplateVersion: '7',
        spotInstanceRequestId: 'sir-warm',
        expiresAt: '2026-10-01T10:00:00.000Z',
      },
      expect.objectContaining({ instanceId: 'i-priming', state: 'PRIMING' }),
    ]);
  });
});

describe('readWarmPoolInstances', () => {
  const warmPoolTags = (environment: string) => [
    { Key: 'ghr:warm-pool', Value: 'true' },
    { Key: 'ghr:environment', Value: environment },
  ];

  it('reads the instances by ID and keeps warm-pool members with their environment', async () => {
    mockEC2Client.on(DescribeInstancesCommand).resolves(
      describeResult([
        {
          InstanceId: 'i-primed',
          State: { Name: 'stopped' },
          StateReason: { Code: 'Client.InstanceInitiatedShutdown' },
          SpotInstanceRequestId: 'sir-1',
          InstanceType: 'm7g.large',
          Placement: { AvailabilityZone: 'eu-west-1a' },
          Tags: warmPoolTags('env-a'),
        },
        {
          InstanceId: 'i-interrupted',
          State: { Name: 'stopped' },
          StateReason: { Code: 'Server.SpotInstanceShutdown' },
          Tags: warmPoolTags('env-b'),
        },
        { InstanceId: 'i-other', State: { Name: 'stopped' }, Tags: [{ Key: 'ghr:environment', Value: 'env-a' }] },
        { InstanceId: 'i-untagged', State: { Name: 'stopped' } },
      ]),
    );

    await expect(
      standby.readWarmPoolInstances(['i-primed', 'i-interrupted', 'i-other', 'i-untagged']),
    ).resolves.toEqual([
      expect.objectContaining({
        instanceId: 'i-primed',
        environment: 'env-a',
        state: 'WARM',
        spotInstanceRequestId: 'sir-1',
        instanceType: 'm7g.large',
        availabilityZone: 'eu-west-1a',
      }),
      expect.objectContaining({ instanceId: 'i-interrupted', environment: 'env-b', state: 'GARBAGE' }),
    ]);
    expect(mockEC2Client).toHaveReceivedCommandTimes(DescribeInstancesCommand, 1);
    expect(mockEC2Client).toHaveReceivedCommandWith(DescribeInstancesCommand, {
      InstanceIds: ['i-primed', 'i-interrupted', 'i-other', 'i-untagged'],
    });
    expect(mockEC2Client).not.toHaveReceivedCommand(DescribeSpotInstanceRequestsCommand);
  });

  it('drops instances EC2 no longer knows', async () => {
    mockEC2Client
      .on(DescribeInstancesCommand)
      .rejectsOnce(await ec2SdkError('InvalidInstanceID.NotFound', "The instance ID 'i-gone' does not exist"))
      .resolves(
        describeResult([
          {
            InstanceId: 'i-primed',
            State: { Name: 'stopped' },
            StateReason: { Code: 'Client.InstanceInitiatedShutdown' },
            Tags: warmPoolTags('env-a'),
          },
        ]),
      );

    await expect(standby.readWarmPoolInstances(['i-gone', 'i-primed'])).resolves.toEqual([
      expect.objectContaining({ instanceId: 'i-primed', state: 'WARM' }),
    ]);
  });
});

describe('readStandby', () => {
  const activated = (time: string) => [{ Key: 'ghr:warm-activated', Value: time }];

  function describeInputs(): object[] {
    return mockEC2Client.commandCalls(DescribeInstancesCommand).map((call) => call.args[0].input);
  }

  function spotDescribeInputs(): object[] {
    return mockEC2Client.commandCalls(DescribeSpotInstanceRequestsCommand).map((call) => call.args[0].input);
  }

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the indexed instances by ID and classifies them with their spot request', async () => {
    mockEC2Client.on(DescribeInstancesCommand).resolves(
      describeResult([
        {
          InstanceId: 'i-warm-spot',
          State: { Name: 'stopped' },
          StateReason: { Code: 'Client.InstanceInitiatedShutdown' },
          SpotInstanceRequestId: 'sir-warm',
          InstanceType: 'm7g.large',
          Placement: { AvailabilityZone: 'eu-west-1a' },
        },
        {
          InstanceId: 'i-interrupted',
          State: { Name: 'stopped' },
          StateReason: { Code: 'Server.SpotInstanceShutdown' },
          SpotInstanceRequestId: 'sir-interrupted',
        },
        { InstanceId: 'i-priming-spot', State: { Name: 'running' }, SpotInstanceRequestId: 'sir-priming' },
      ]),
    );
    mockEC2Client.on(DescribeSpotInstanceRequestsCommand).resolves({
      SpotInstanceRequests: [
        { SpotInstanceRequestId: 'sir-warm', State: 'disabled', Status: { Code: 'instance-stopped-by-user' } },
        { SpotInstanceRequestId: 'sir-interrupted', State: 'disabled', Status: { Code: 'instance-stopped-by-price' } },
      ],
    });

    const result = await standby.readStandby([
      { instanceId: 'i-warm-spot' },
      { instanceId: 'i-interrupted' },
      { instanceId: 'i-priming-spot' },
    ]);

    expect(describeInputs()).toEqual([{ InstanceIds: ['i-warm-spot', 'i-interrupted', 'i-priming-spot'] }]);
    // Only stopped spot instances need their request; never a filtered query.
    expect(spotDescribeInputs()).toEqual([{ SpotInstanceRequestIds: ['sir-warm', 'sir-interrupted'] }]);
    expect(result).toEqual({
      instances: [
        expect.objectContaining({
          instanceId: 'i-warm-spot',
          state: 'WARM',
          spotInstanceRequestId: 'sir-warm',
          instanceType: 'm7g.large',
          availabilityZone: 'eu-west-1a',
        }),
        expect.objectContaining({ instanceId: 'i-interrupted', state: 'GARBAGE' }),
        expect.objectContaining({ instanceId: 'i-priming-spot', state: 'PRIMING' }),
      ],
      orphanedSpotRequests: [],
      releasedInstanceIds: [],
    });
  });

  it('makes no spot request query for an on-demand pool', async () => {
    mockEC2Client.on(DescribeInstancesCommand).resolves(
      describeResult([
        {
          InstanceId: 'i-warm',
          State: { Name: 'stopped' },
          StateReason: { Code: 'Client.InstanceInitiatedShutdown' },
        },
      ]),
    );

    const result = await standby.readStandby([{ instanceId: 'i-warm' }]);

    expect(result.instances).toEqual([expect.objectContaining({ instanceId: 'i-warm', state: 'WARM' })]);
    expect(mockEC2Client).not.toHaveReceivedCommand(DescribeSpotInstanceRequestsCommand);
  });

  it('makes no call for an empty index', async () => {
    await expect(standby.readStandby([])).resolves.toEqual({
      instances: [],
      orphanedSpotRequests: [],
      releasedInstanceIds: [],
    });
    expect(mockEC2Client).not.toHaveReceivedAnyCommand();
  });

  it('drops instance IDs EC2 no longer knows and reads the rest', async () => {
    mockEC2Client
      .on(DescribeInstancesCommand)
      .rejectsOnce(await ec2SdkError('InvalidInstanceID.NotFound', "The instance IDs 'i-gone1, i-gone2' do not exist"))
      .resolves(describeResult([{ InstanceId: 'i-live', State: { Name: 'running' } }]));

    const result = await standby.readStandby([
      { instanceId: 'i-gone1' },
      { instanceId: 'i-live' },
      { instanceId: 'i-gone2' },
    ]);

    expect(describeInputs()).toEqual([{ InstanceIds: ['i-gone1', 'i-live', 'i-gone2'] }, { InstanceIds: ['i-live'] }]);
    expect(result.instances).toEqual([expect.objectContaining({ instanceId: 'i-live', state: 'PRIMING' })]);
    expect(result.releasedInstanceIds).toEqual(['i-gone1', 'i-gone2']);
  });

  it('rethrows a not-found error that names none of the requested IDs', async () => {
    mockEC2Client.on(DescribeInstancesCommand).rejects(await ec2SdkError('InvalidInstanceID.NotFound', 'gone'));

    await expect(standby.readStandby([{ instanceId: 'i-1' }])).rejects.toThrow();
  });

  it('reads more than 200 instances in chunks', async () => {
    mockEC2Client.on(DescribeInstancesCommand).resolves(describeResult([]));
    const indexed = Array.from({ length: 250 }, (_, i) => ({ instanceId: `i-${i.toString(16).padStart(4, '0')}` }));

    await standby.readStandby(indexed);

    expect(describeInputs().map((input) => (input as { InstanceIds: string[] }).InstanceIds.length)).toEqual([200, 50]);
  });

  it('reports live requests of gone or settled activated spot instances, with their replacement', async () => {
    mockEC2Client.on(DescribeInstancesCommand).resolves(
      describeResult([
        { InstanceId: 'i-terminated', State: { Name: 'terminated' }, SpotInstanceRequestId: 'sir-respawned' },
        { InstanceId: 'i-going', State: { Name: 'shutting-down' }, SpotInstanceRequestId: 'sir-closed' },
        {
          InstanceId: 'i-settled',
          State: { Name: 'running' },
          SpotInstanceRequestId: 'sir-settled',
          Tags: activated('2026-09-30T11:50:00.000Z'),
        },
        {
          InstanceId: 'i-activating',
          State: { Name: 'running' },
          SpotInstanceRequestId: 'sir-activating',
          Tags: activated('2026-09-30T11:55:00.000Z'),
        },
      ]),
    );
    mockEC2Client.on(DescribeSpotInstanceRequestsCommand).resolves({
      SpotInstanceRequests: [
        { SpotInstanceRequestId: 'sir-respawned', State: 'active', InstanceId: 'i-respawn' },
        { SpotInstanceRequestId: 'sir-closed', State: 'closed', InstanceId: 'i-going' },
        { SpotInstanceRequestId: 'sir-settled', State: 'active', InstanceId: 'i-settled' },
      ],
    });

    const result = await standby.readStandby([
      { instanceId: 'i-terminated' },
      { instanceId: 'i-going' },
      { instanceId: 'i-settled' },
      { instanceId: 'i-activating' },
      { instanceId: 'i-missing', spotInstanceRequestId: 'sir-purged' },
    ]);

    expect(spotDescribeInputs()).toEqual([
      { SpotInstanceRequestIds: ['sir-respawned', 'sir-closed', 'sir-settled', 'sir-purged'] },
    ]);
    expect(result.instances).toEqual([]);
    expect(result.orphanedSpotRequests).toEqual([
      {
        spotInstanceRequestId: 'sir-respawned',
        state: 'active',
        instanceId: 'i-terminated',
        replacementInstanceId: 'i-respawn',
      },
      { spotInstanceRequestId: 'sir-settled', state: 'active', instanceId: 'i-settled' },
    ]);
    // The activation still in progress keeps its entry; a request AWS no longer reports is not live.
    expect(result.releasedInstanceIds).toEqual(['i-going', 'i-missing']);
  });

  it('never reports the disabled request of a running activated instance, which AWS would terminate', async () => {
    mockEC2Client.on(DescribeInstancesCommand).resolves(
      describeResult([
        {
          InstanceId: 'i-running',
          State: { Name: 'running' },
          SpotInstanceRequestId: 'sir-disabled',
          Tags: activated('2026-09-30T11:00:00.000Z'),
        },
        {
          InstanceId: 'i-stopped',
          State: { Name: 'stopped' },
          SpotInstanceRequestId: 'sir-stopped',
          Tags: activated('2026-09-30T11:00:00.000Z'),
        },
      ]),
    );
    mockEC2Client.on(DescribeSpotInstanceRequestsCommand).resolves({
      SpotInstanceRequests: [
        { SpotInstanceRequestId: 'sir-disabled', State: 'disabled', InstanceId: 'i-running' },
        { SpotInstanceRequestId: 'sir-stopped', State: 'disabled', InstanceId: 'i-stopped' },
      ],
    });

    const result = await standby.readStandby([{ instanceId: 'i-running' }, { instanceId: 'i-stopped' }]);

    expect(result.orphanedSpotRequests).toEqual([
      { spotInstanceRequestId: 'sir-stopped', state: 'disabled', instanceId: 'i-stopped' },
    ]);
    // Kept in the index, so a later run detaches it once the request is active.
    expect(result.releasedInstanceIds).toEqual([]);
  });

  it('releases settled activated and gone on-demand instances', async () => {
    mockEC2Client.on(DescribeInstancesCommand).resolves(
      describeResult([
        { InstanceId: 'i-terminated', State: { Name: 'terminated' } },
        { InstanceId: 'i-settled', State: { Name: 'running' } },
      ]),
    );

    const result = await standby.readStandby([
      { instanceId: 'i-terminated' },
      { instanceId: 'i-settled', activatedAt: '2026-09-30T11:00:00.000Z' },
    ]);

    expect(result.releasedInstanceIds).toEqual(['i-terminated', 'i-settled']);
    expect(mockEC2Client).not.toHaveReceivedCommand(DescribeSpotInstanceRequestsCommand);
  });

  it('drops spot request IDs AWS no longer knows', async () => {
    mockEC2Client
      .on(DescribeInstancesCommand)
      .resolves(
        describeResult([{ InstanceId: 'i-gone', State: { Name: 'terminated' }, SpotInstanceRequestId: 'sir-gone' }]),
      );
    mockEC2Client
      .on(DescribeSpotInstanceRequestsCommand)
      .rejectsOnce(
        await ec2SdkError(
          'InvalidSpotInstanceRequestID.NotFound',
          "The spot instance request ID 'sir-gone' does not exist",
        ),
      );

    const result = await standby.readStandby([{ instanceId: 'i-gone' }]);

    expect(result.spotLookupError).toBeUndefined();
    expect(result.releasedInstanceIds).toEqual(['i-gone']);
  });

  it('classifies from EC2 data and keeps spot entries when the Spot API throttles the lookup', async () => {
    mockEC2Client.on(DescribeInstancesCommand).resolves(
      describeResult([
        {
          InstanceId: 'i-warm-spot',
          State: { Name: 'stopped' },
          StateReason: { Code: 'Client.InstanceInitiatedShutdown' },
          SpotInstanceRequestId: 'sir-warm',
        },
        { InstanceId: 'i-gone', State: { Name: 'terminated' }, SpotInstanceRequestId: 'sir-gone' },
      ]),
    );
    mockEC2Client
      .on(DescribeSpotInstanceRequestsCommand)
      .rejects(await ec2SdkError('RequestResourceCountExceeded', 'exceeds the Spot service limits', 503));

    const result = await standby.readStandby([{ instanceId: 'i-warm-spot' }, { instanceId: 'i-gone' }]);

    expect(result).toEqual({
      instances: [expect.objectContaining({ instanceId: 'i-warm-spot', state: 'WARM' })],
      orphanedSpotRequests: [],
      spotLookupError: 'RequestResourceCountExceeded',
      releasedInstanceIds: [],
    });
  });
});

describe('listScaleDownInstances', () => {
  it('lists runners and stopped warm instances of the environment in one call', async () => {
    mockEC2Client.on(DescribeInstancesCommand).resolves(
      describeResult([
        {
          InstanceId: 'i-runner',
          State: { Name: 'running' },
          Tags: [
            { Key: 'ghr:Owner', Value: 'owner' },
            { Key: 'ghr:Type', Value: 'Org' },
          ],
        },
        {
          InstanceId: 'i-expired',
          State: { Name: 'stopped' },
          SpotInstanceRequestId: 'sir-expired',
          Tags: [
            { Key: 'ghr:warm-pool', Value: 'true' },
            { Key: 'ghr:warm-expires-at', Value: '2026-09-29T12:00:00.000Z' },
          ],
        },
        { InstanceId: 'i-stopped-other', State: { Name: 'stopped' } },
        {
          InstanceId: 'i-activated-spot',
          State: { Name: 'running' },
          SpotInstanceRequestId: 'sir-activated',
          Tags: [{ Key: 'ghr:warm-activated', Value: '2026-09-30T11:00:00.000Z' }],
        },
        { InstanceId: 'i-cold-spot', State: { Name: 'running' }, SpotInstanceRequestId: 'sir-cold' },
      ]),
    );

    const result = await standby.listScaleDownInstances('unit-test');

    expect(mockEC2Client).toHaveReceivedCommandTimes(DescribeInstancesCommand, 1);
    expect(mockEC2Client).toHaveReceivedCommandWith(DescribeInstancesCommand, {
      Filters: [
        { Name: 'instance-state-name', Values: ['running', 'pending', 'stopped'] },
        { Name: 'tag:ghr:environment', Values: ['unit-test'] },
        { Name: 'tag:ghr:Application', Values: ['github-action-runner'] },
      ],
    });
    expect(result.runners).toEqual([
      expect.objectContaining({ id: 'i-runner', owner: 'owner', type: 'Org' }),
      expect.objectContaining({ id: 'i-activated-spot' }),
      expect.objectContaining({ id: 'i-cold-spot' }),
    ]);
    expect(result.activatedSpotRequests).toEqual({ 'i-activated-spot': 'sir-activated' });
    expect(result.stoppedWarm).toEqual([
      {
        instanceId: 'i-expired',
        spotInstanceRequestId: 'sir-expired',
        expiresAt: '2026-09-29T12:00:00.000Z',
        activated: false,
        activatedAt: undefined,
      },
    ]);
  });
});

describe('listStoppedWarmInstances', () => {
  it('lists stopped warm-pool instances of the environment across pages', async () => {
    mockEC2Client
      .on(DescribeInstancesCommand)
      .resolvesOnce({
        ...describeResult([
          {
            InstanceId: 'i-expired',
            State: { Name: 'stopped' },
            SpotInstanceRequestId: 'sir-expired',
            Tags: [{ Key: 'ghr:warm-expires-at', Value: '2026-09-29T12:00:00.000Z' }],
          },
        ]),
        NextToken: 'next',
      })
      .resolvesOnce(
        describeResult([
          {
            InstanceId: 'i-activated',
            State: { Name: 'stopped' },
            Tags: [{ Key: 'ghr:warm-activated', Value: '2026-09-30T11:00:00.000Z' }],
          },
        ]),
      );

    const result = await standby.listStoppedWarmInstances('unit-test');

    const filters = [
      { Name: 'instance-state-name', Values: ['stopped'] },
      { Name: 'tag:ghr:Application', Values: ['github-action-runner'] },
      { Name: 'tag:ghr:environment', Values: ['unit-test'] },
      { Name: 'tag:ghr:warm-pool', Values: ['true'] },
    ];
    expect(mockEC2Client).toHaveReceivedCommandWith(DescribeInstancesCommand, { Filters: filters });
    expect(mockEC2Client).toHaveReceivedCommandWith(DescribeInstancesCommand, { Filters: filters, NextToken: 'next' });
    expect(result).toEqual([
      {
        instanceId: 'i-expired',
        spotInstanceRequestId: 'sir-expired',
        expiresAt: '2026-09-29T12:00:00.000Z',
        activated: false,
        activatedAt: undefined,
      },
      {
        instanceId: 'i-activated',
        spotInstanceRequestId: undefined,
        expiresAt: undefined,
        activated: true,
        activatedAt: '2026-09-30T11:00:00.000Z',
      },
    ]);
  });

  it('returns nothing when no stopped warm instance matches', async () => {
    mockEC2Client.on(DescribeInstancesCommand).resolves({ Reservations: [] });

    await expect(standby.listStoppedWarmInstances('unit-test')).resolves.toEqual([]);
  });
});

describe('cancelSpotRequest', () => {
  it('cancels the spot request', async () => {
    mockEC2Client.on(CancelSpotInstanceRequestsCommand).resolves({});

    await standby.cancelSpotRequest('sir-1');

    expect(mockEC2Client).toHaveReceivedCommandWith(CancelSpotInstanceRequestsCommand, {
      SpotInstanceRequestIds: ['sir-1'],
    });
  });

  it('tolerates a spot request that no longer exists', async () => {
    mockEC2Client.on(CancelSpotInstanceRequestsCommand).rejects(awsError('InvalidSpotInstanceRequestID.NotFound'));

    await expect(standby.cancelSpotRequest('sir-gone')).resolves.toBeUndefined();
  });

  it('tolerates a missing spot request as the installed SDK deserializes it', async () => {
    mockEC2Client
      .on(CancelSpotInstanceRequestsCommand)
      .rejects(
        await ec2SdkError('InvalidSpotInstanceRequestID.NotFound', 'The spot instance request ID does not exist'),
      );

    await expect(standby.cancelSpotRequest('sir-gone')).resolves.toBeUndefined();
  });
});

describe('currentImage', () => {
  it('resolves the AMI from SSM and the default launch template version', async () => {
    vi.mocked(getParameter).mockResolvedValue('ami-123');
    mockEC2Client
      .on(DescribeLaunchTemplateVersionsCommand)
      .resolves({ LaunchTemplateVersions: [{ VersionNumber: 7, LaunchTemplateData: { ImageId: 'ami-template' } }] });

    await expect(standby.currentImage({ launchTemplateName: 'lt-1', amiIdSsmParameterName: '/ami' })).resolves.toEqual({
      imageId: 'ami-123',
      launchTemplateVersion: '7',
    });
    expect(getParameter).toHaveBeenCalledWith('/ami');
    expect(mockEC2Client).toHaveReceivedCommandWith(DescribeLaunchTemplateVersionsCommand, {
      LaunchTemplateName: 'lt-1',
      Versions: ['$Default'],
    });
  });

  it('resolves a resolve:ssm image of the launch template', async () => {
    vi.mocked(getParameter).mockResolvedValue('ami-from-parameter');
    mockEC2Client.on(DescribeLaunchTemplateVersionsCommand).resolves({
      LaunchTemplateVersions: [
        {
          VersionNumber: 3,
          LaunchTemplateData: { ImageId: 'resolve:ssm:arn:aws:ssm:eu-west-1:123456789012:parameter/ami' },
        },
      ],
    });

    await expect(standby.currentImage({ launchTemplateName: 'lt-1' })).resolves.toEqual({
      imageId: 'ami-from-parameter',
      launchTemplateVersion: '3',
    });
    expect(getParameter).toHaveBeenCalledWith('arn:aws:ssm:eu-west-1:123456789012:parameter/ami');
  });

  it('uses a literal image of the launch template', async () => {
    mockEC2Client
      .on(DescribeLaunchTemplateVersionsCommand)
      .resolves({ LaunchTemplateVersions: [{ VersionNumber: 1, LaunchTemplateData: { ImageId: 'ami-literal' } }] });

    await expect(standby.currentImage({ launchTemplateName: 'lt-1' })).resolves.toEqual({
      imageId: 'ami-literal',
      launchTemplateVersion: '1',
    });
    expect(getParameter).not.toHaveBeenCalled();
  });

  it('leaves values undefined when they are not configured', async () => {
    await expect(standby.currentImage({})).resolves.toEqual({ imageId: undefined, launchTemplateVersion: undefined });
    expect(getParameter).not.toHaveBeenCalled();
    expect(mockEC2Client.calls()).toHaveLength(0);
  });

  it('leaves a value undefined when its lookup fails', async () => {
    vi.mocked(getParameter).mockRejectedValue(awsError('ParameterNotFound'));
    mockEC2Client
      .on(DescribeLaunchTemplateVersionsCommand)
      .resolves({ LaunchTemplateVersions: [{ VersionNumber: 2 }] });

    await expect(
      standby.currentImage({ launchTemplateName: 'lt-1', amiIdSsmParameterName: '/missing' }),
    ).resolves.toEqual({ imageId: undefined, launchTemplateVersion: '2' });
  });

  it('rethrows when the request is aborted', async () => {
    const abortController = new AbortController();
    const operations = createEc2StandbyClient(new EC2Client({})).forRequest({ signal: abortController.signal });
    abortController.abort(new Error('service stopping'));

    await expect(operations.currentImage({ launchTemplateName: 'lt-1' })).rejects.toThrow('service stopping');
  });
});

describe('startInstance', () => {
  it('starts the stopped instance', async () => {
    mockEC2Client.on(StartInstancesCommand).resolves({});

    await standby.startInstance('i-warm');

    expect(mockEC2Client).toHaveReceivedCommandWith(StartInstancesCommand, { InstanceIds: ['i-warm'] });
  });

  it('propagates start failures', async () => {
    mockEC2Client.on(StartInstancesCommand).rejects(awsError('InsufficientInstanceCapacity'));

    await expect(standby.startInstance('i-warm')).rejects.toThrow('InsufficientInstanceCapacity');
  });
});
