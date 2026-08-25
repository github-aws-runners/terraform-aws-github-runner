import { createHash } from 'node:crypto';

import {
  CreateFleetCommand,
  CreateTagsCommand,
  DescribeInstancesCommand,
  EC2Client,
  TerminateInstancesCommand,
  type Instance,
} from '@aws-sdk/client-ec2';
import { DeleteParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  GenerateScaleSetJitConfigurationResult,
  ScaleSetReconcileRequest,
  ScaleSetRunnerState,
} from '../../../../scale-set';
import {
  createEc2ScaleSetProvider,
  EC2_GITHUB_SCOPE_HASH_TAG,
  EC2_GITHUB_RUNNER_ID_TAG,
  EC2_RUNNER_CONFIG_TAG,
  EC2_RUNNER_NAME_TAG,
  EC2_SCALE_SET_ID_TAG,
  EC2_SCALE_SET_STATE_TAG,
  parseEc2ScaleSetProviderConfig,
  type Ec2ScaleSetProviderConfig,
} from './provider';

const ec2Mock = mockClient(EC2Client);
const ssmMock = mockClient(SSMClient);
const ec2Client = new EC2Client({ region: 'eu-west-1' });
const ssmClient = new SSMClient({ region: 'eu-west-1' });
const signal = new AbortController().signal;
const githubScope = 'https://github.com/example';
const githubScopeHash = createHash('sha256').update(githubScope, 'utf8').digest('hex');

const config: Ec2ScaleSetProviderConfig = {
  region: 'eu-west-1',
  environment: 'unit-test',
  runnerNamePrefix: 'runner-',
  jitConfigParameterPath: '/github-action-runners/unit-test/runners/tokens',
  subnets: ['subnet-12345678'],
  launchTemplateName: 'unit-test-runners',
  ec2instanceCriteria: {
    instanceTypes: ['m7i.large'],
    targetCapacityType: 'on-demand',
    instanceAllocationStrategy: 'lowest-price',
  },
  scaleErrors: ['InsufficientInstanceCapacity'],
  ssmParameterTags: [{ Key: 'Project', Value: 'runner-tests' }],
};

function ownedInstance(
  instanceId: string,
  identity?: { runnerId: number; runnerName: string },
  overrides: {
    runnerConfigName?: string;
    scaleSetId?: number;
    scaleSetState?: string;
    githubScopeHash?: string;
    launchTime?: Date;
  } = {},
): Instance {
  return {
    InstanceId: instanceId,
    LaunchTime: overrides.launchTime ?? new Date('2026-08-24T10:00:00Z'),
    Tags: [
      { Key: 'ghr:Application', Value: 'github-action-runner' },
      { Key: 'ghr:created_by', Value: 'scale-set-service' },
      { Key: 'ghr:environment', Value: 'unit-test' },
      { Key: EC2_RUNNER_CONFIG_TAG, Value: overrides.runnerConfigName ?? 'linux' },
      { Key: EC2_SCALE_SET_ID_TAG, Value: String(overrides.scaleSetId ?? 42) },
      { Key: EC2_GITHUB_SCOPE_HASH_TAG, Value: overrides.githubScopeHash ?? githubScopeHash },
      {
        Key: EC2_SCALE_SET_STATE_TAG,
        Value: overrides.scaleSetState ?? (identity ? 'config-published' : 'provisioning'),
      },
      ...(identity
        ? [
            { Key: EC2_RUNNER_NAME_TAG, Value: identity.runnerName },
            { Key: EC2_GITHUB_RUNNER_ID_TAG, Value: String(identity.runnerId) },
          ]
        : []),
    ],
  };
}

function githubState(
  runnerId: number,
  runnerName: string,
  overrides: Partial<ScaleSetRunnerState> = {},
): ScaleSetRunnerState {
  return {
    runnerId,
    runnerName,
    scaleSetId: 42,
    status: 'online',
    busy: false,
    lifecycle: 'unknown',
    ...overrides,
  };
}

function jitResult(instanceId = 'i-1234567890abcdef0'): GenerateScaleSetJitConfigurationResult {
  return {
    encodedJitConfiguration: 'sensitive-encoded-jit-configuration',
    runnerId: 101,
    runnerName: `runner-${instanceId}`,
    scaleSetId: 42,
  };
}

function createRequest(overrides: Partial<ScaleSetReconcileRequest> = {}): ScaleSetReconcileRequest {
  return {
    desiredRunners: 1,
    bootTimeoutMinutes: 10,
    runnerInventoryComplete: false,
    runnerStates: [],
    signal,
    generateJitConfiguration: vi.fn().mockResolvedValue(jitResult()),
    removeRunner: vi.fn().mockResolvedValue({ status: 'removed' }),
    ...overrides,
  };
}

function provider(options: { githubScope?: string; now?: () => number } = {}) {
  return createEc2ScaleSetProvider(
    {
      runnerConfigName: 'linux',
      scaleSetId: 42,
      githubScope: options.githubScope ?? githubScope,
      configuration: config,
    },
    {
      ec2Client,
      ssmClient,
      now: options.now ?? (() => new Date('2026-08-24T10:05:00Z').getTime()),
    },
  );
}

beforeEach(() => {
  ec2Mock.reset();
  ssmMock.reset();
  ec2Mock.on(CreateTagsCommand).resolves({});
  ec2Mock.on(TerminateInstancesCommand).resolves({});
  ssmMock.on(PutParameterCommand).resolves({});
  ssmMock.on(DeleteParameterCommand).resolves({});
});

describe('EC2 scale-set provider configuration', () => {
  it('strictly parses the supported provider-owned configuration', () => {
    expect(parseEc2ScaleSetProviderConfig(config)).toMatchObject(config);
    expect(parseEc2ScaleSetProviderConfig({ ...config, runnerNamePrefix: '' })).toMatchObject({
      runnerNamePrefix: '',
    });
    expect(parseEc2ScaleSetProviderConfig({ ...config, runnerNamePrefix: 'r'.repeat(45) })).toMatchObject({
      runnerNamePrefix: 'r'.repeat(45),
    });
  });

  it.each([
    [{ ...config, region: '$(credential)' }],
    [{ ...config, subnets: ['subnet-12345678', 'subnet-12345678'] }],
    [{ ...config, ec2instanceCriteria: { ...config.ec2instanceCriteria, instanceAllocationStrategy: 'diversified' } }],
    [{ ...config, ec2OverrideConfig: { UserData: 'untrusted' } }],
    [{ ...config, ssmParameterTags: [{ Key: 'aws:owner', Value: 'untrusted' }] }],
    [{ ...config, runnerNamePrefix: 'r'.repeat(46) }],
    [{ ...config, bootTimeoutMinutes: 10 }],
  ])('rejects invalid or unsupported values instead of forwarding them to AWS', (invalid) => {
    expect(() => parseEc2ScaleSetProviderConfig(invalid)).toThrow();
  });

  it('does not expose configurable EC2 ownership or lifecycle tags', () => {
    expect(Object.keys(config)).not.toContain('additionalTags');
    expect(() =>
      parseEc2ScaleSetProviderConfig({
        ...config,
        additionalTags: [{ Key: EC2_SCALE_SET_ID_TAG, Value: 'another-scale-set' }],
      }),
    ).toThrow("Unsupported EC2 scale-set configuration field 'configuration.additionalTags'");
  });

  it('rejects non-canonical GitHub ownership scopes before creating clients', () => {
    expect(() => provider({ githubScope: 'https://GITHUB.com/example/' })).toThrow(
      'githubScope must be a canonical HTTPS GitHub configuration URL',
    );
  });
});

describe('EC2 scale-set reconciliation', () => {
  it('lists only the exact runner-config and scale-set ownership boundary', async () => {
    ec2Mock.on(DescribeInstancesCommand).resolves({
      Reservations: [
        {
          Instances: [
            ownedInstance('i-owned', { runnerId: 101, runnerName: 'runner-i-owned' }),
            ownedInstance('i-other', undefined, { runnerConfigName: 'other' }),
            ownedInstance(
              'i-other-scope',
              { runnerId: 102, runnerName: 'runner-i-other-scope' },
              {
                githubScopeHash: createHash('sha256').update('https://github.com/another', 'utf8').digest('hex'),
              },
            ),
          ],
        },
      ],
    });

    const result = await provider().reconcile(createRequest());

    expect(result).toMatchObject({ status: 'converged', desiredRunners: 1, currentRunners: 1 });
    expect(ec2Mock).toHaveReceivedCommandWith(DescribeInstancesCommand, {
      Filters: expect.arrayContaining([
        { Name: `tag:${EC2_RUNNER_CONFIG_TAG}`, Values: ['linux'] },
        { Name: `tag:${EC2_SCALE_SET_ID_TAG}`, Values: ['42'] },
        { Name: `tag:${EC2_GITHUB_SCOPE_HASH_TAG}`, Values: [githubScopeHash] },
      ]),
    });
    expect(ec2Mock).not.toHaveReceivedCommand(CreateFleetCommand);
  });

  it('counts a young handed-off instance as serving during its bounded boot window', async () => {
    ec2Mock.on(DescribeInstancesCommand).resolves({
      Reservations: [
        {
          Instances: [ownedInstance('i-booting', { runnerId: 101, runnerName: 'runner-i-booting' })],
        },
      ],
    });

    const result = await provider({ now: () => new Date('2026-08-24T10:09:59Z').getTime() }).reconcile(createRequest());

    expect(result).toMatchObject({
      status: 'converged',
      currentRunners: 1,
      needsRunnerInventory: false,
      actions: { launched: 0, retainedUnknown: 0 },
    });
    expect(ec2Mock).not.toHaveReceivedCommand(CreateFleetCommand);
  });

  it('uses the orchestration request boot window instead of provider configuration', async () => {
    ec2Mock.on(DescribeInstancesCommand).resolves({
      Reservations: [
        {
          Instances: [ownedInstance('i-at-timeout', { runnerId: 101, runnerName: 'runner-i-at-timeout' })],
        },
      ],
    });

    const result = await provider({ now: () => new Date('2026-08-24T10:05:00Z').getTime() }).reconcile(
      createRequest({ bootTimeoutMinutes: 5 }),
    );

    expect(result).toMatchObject({
      status: 'retained',
      currentRunners: 1,
      needsRunnerInventory: true,
      actions: { launched: 0, retainedUnknown: 1 },
    });
    expect(ec2Mock).not.toHaveReceivedCommand(CreateFleetCommand);
  });

  it('requests a complete inventory for an old handoff, then counts only its exact online identity', async () => {
    const instance = ownedInstance('i-old', { runnerId: 101, runnerName: 'runner-i-old' });
    ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [{ Instances: [instance] }] });
    const computeProvider = provider({ now: () => new Date('2026-08-24T10:10:00Z').getTime() });

    const firstPass = await computeProvider.reconcile(createRequest());

    expect(firstPass).toMatchObject({
      status: 'retained',
      currentRunners: 1,
      needsRunnerInventory: true,
      actions: { launched: 0, retainedUnknown: 1 },
    });
    expect(ec2Mock).not.toHaveReceivedCommand(CreateFleetCommand);

    const secondPass = await computeProvider.reconcile(
      createRequest({
        runnerInventoryComplete: true,
        runnerStates: [githubState(101, 'runner-i-old', { status: 'online', lifecycle: 'unknown' })],
      }),
    );

    expect(secondPass).toMatchObject({
      status: 'converged',
      currentRunners: 1,
      needsRunnerInventory: false,
      actions: { launched: 0, retainedUnknown: 0 },
    });
    expect(ec2Mock).not.toHaveReceivedCommand(CreateFleetCommand);
  });

  it('counts an exact JobStarted identity as serving without waiting for public inventory', async () => {
    const instance = ownedInstance('i-started', { runnerId: 101, runnerName: 'runner-i-started' });
    ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [{ Instances: [instance] }] });

    const result = await provider({ now: () => new Date('2026-08-24T12:00:00Z').getTime() }).reconcile(
      createRequest({
        runnerStates: [
          githubState(101, 'runner-i-started', { status: 'unknown', busy: undefined, lifecycle: 'started' }),
        ],
      }),
    );

    expect(result).toMatchObject({
      status: 'converged',
      currentRunners: 1,
      needsRunnerInventory: false,
      actions: { launched: 0, retainedUnknown: 0 },
    });
  });

  it('retains an old offline handoff and bounds replacement to one physical surge instance', async () => {
    const old = ownedInstance('i-old-offline', { runnerId: 100, runnerName: 'runner-i-old-offline' });
    const replacementId = 'i-1234567890abcdef0';
    const replacement = ownedInstance(
      replacementId,
      { runnerId: 101, runnerName: `runner-${replacementId}` },
      {
        launchTime: new Date('2026-08-24T10:10:30Z'),
      },
    );
    ec2Mock
      .on(DescribeInstancesCommand)
      .resolvesOnce({ Reservations: [{ Instances: [old] }] })
      .resolves({ Reservations: [{ Instances: [old, replacement] }] });
    ec2Mock.on(CreateFleetCommand).resolves({ Instances: [{ InstanceIds: [replacementId] }] });
    const computeProvider = provider({ now: () => new Date('2026-08-24T10:11:00Z').getTime() });
    const completeInventory = createRequest({
      runnerInventoryComplete: true,
      runnerStates: [
        githubState(100, 'runner-i-old-offline', {
          status: 'offline',
          busy: false,
          lifecycle: 'completed',
        }),
      ],
    });

    const result = await computeProvider.reconcile(completeInventory);
    const nextResult = await computeProvider.reconcile(completeInventory);

    expect(result).toMatchObject({
      status: 'retained',
      currentRunners: 2,
      needsRunnerInventory: false,
      actions: { launched: 1, retainedUnknown: 1 },
    });
    expect(nextResult).toMatchObject({
      status: 'retained',
      currentRunners: 2,
      needsRunnerInventory: false,
      actions: { launched: 0, retainedUnknown: 1 },
    });
    expect(ec2Mock).toHaveReceivedCommandTimes(CreateFleetCommand, 1);
  });

  it.each(['provisioning', 'publishing'])(
    'retains interrupted %s capacity but provisions a replacement',
    async (scaleSetState) => {
      const stuck = ownedInstance(
        'i-stuck',
        scaleSetState === 'publishing' ? { runnerId: 100, runnerName: 'runner-i-stuck' } : undefined,
        { scaleSetState },
      );
      const replacement = 'i-1234567890abcdef0';
      ec2Mock
        .on(DescribeInstancesCommand)
        .resolvesOnce({ Reservations: [{ Instances: [stuck] }] })
        .resolves({
          Reservations: [
            {
              Instances: [stuck, ownedInstance(replacement, { runnerId: 101, runnerName: `runner-${replacement}` })],
            },
          ],
        });
      ec2Mock.on(CreateFleetCommand).resolves({ Instances: [{ InstanceIds: [replacement] }] });
      const computeProvider = provider();

      const result = await computeProvider.reconcile(createRequest());

      expect(result).toMatchObject({
        status: 'retained',
        currentRunners: 2,
        actions: { launched: 1, terminated: 0, retainedUnknown: 1 },
        errors: [],
      });
      expect(ec2Mock).not.toHaveReceivedCommandWith(TerminateInstancesCommand, { InstanceIds: ['i-stuck'] });
      expect(ssmMock).toHaveReceivedCommandWith(PutParameterCommand, {
        Name: `${config.jitConfigParameterPath}/${replacement}`,
      });

      const nextResult = await computeProvider.reconcile(createRequest());
      expect(nextResult).toMatchObject({
        status: 'retained',
        currentRunners: 2,
        actions: { launched: 0, terminated: 0, retainedUnknown: 1 },
        errors: [],
      });
      expect(ec2Mock).toHaveReceivedCommandTimes(CreateFleetCommand, 1);
    },
  );

  it('caps retained-capacity replacement surge when every replacement remains ambiguous', async () => {
    const ambiguous = [
      ownedInstance('i-stuck-1', undefined, { scaleSetState: 'provisioning' }),
      ownedInstance('i-stuck-2', { runnerId: 102, runnerName: 'runner-i-stuck-2' }, { scaleSetState: 'publishing' }),
    ];
    ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [{ Instances: ambiguous }] });

    const result = await provider().reconcile(createRequest());

    expect(result).toMatchObject({
      status: 'retained',
      currentRunners: 2,
      actions: { launched: 0, terminated: 0, retainedUnknown: 2 },
      errors: [],
    });
    expect(ec2Mock).not.toHaveReceivedCommand(CreateFleetCommand);
  });

  it('launches owned compute, verifies JIT identity, and publishes only a SecureString', async () => {
    const instanceId = 'i-1234567890abcdef0';
    ec2Mock.on(DescribeInstancesCommand).resolves({});
    ec2Mock.on(CreateFleetCommand).resolves({ Instances: [{ InstanceIds: [instanceId] }] });
    const generateJitConfiguration = vi.fn().mockResolvedValue(jitResult(instanceId));

    const result = await provider().reconcile(createRequest({ generateJitConfiguration }));

    expect(result).toEqual({
      status: 'converged',
      desiredRunners: 1,
      currentRunners: 1,
      needsRunnerInventory: false,
      actions: { launched: 1, terminated: 0, retainedBusy: 0, retainedUnknown: 0 },
      errors: [],
    });
    expect(generateJitConfiguration).toHaveBeenCalledWith({ runnerName: `runner-${instanceId}`, signal });
    expect(ec2Mock).toHaveReceivedCommandWith(CreateFleetCommand, {
      TagSpecifications: expect.arrayContaining([
        expect.objectContaining({
          ResourceType: 'instance',
          Tags: expect.arrayContaining([
            { Key: 'ghr:Owner', Value: 'example' },
            { Key: 'ghr:Type', Value: 'Org' },
            { Key: EC2_RUNNER_CONFIG_TAG, Value: 'linux' },
            { Key: EC2_SCALE_SET_ID_TAG, Value: '42' },
            { Key: EC2_GITHUB_SCOPE_HASH_TAG, Value: githubScopeHash },
            { Key: EC2_SCALE_SET_STATE_TAG, Value: 'provisioning' },
          ]),
        }),
      ]),
    });
    expect(ssmMock).toHaveReceivedCommandWith(PutParameterCommand, {
      Name: `${config.jitConfigParameterPath}/${instanceId}`,
      Value: 'sensitive-encoded-jit-configuration',
      Type: 'SecureString',
      Overwrite: false,
      Tags: expect.arrayContaining([
        { Key: 'InstanceId', Value: instanceId },
        { Key: EC2_RUNNER_CONFIG_TAG, Value: 'linux' },
        { Key: EC2_SCALE_SET_ID_TAG, Value: '42' },
        { Key: EC2_GITHUB_SCOPE_HASH_TAG, Value: githubScopeHash },
      ]),
    });
  });

  it('does not remove an unrelated GitHub runner when JIT identity validation fails', async () => {
    const instanceId = 'i-1234567890abcdef0';
    ec2Mock.on(DescribeInstancesCommand).resolves({});
    ec2Mock.on(CreateFleetCommand).resolves({ Instances: [{ InstanceIds: [instanceId] }] });
    const removeRunner = vi.fn();

    const result = await provider().reconcile(
      createRequest({
        generateJitConfiguration: vi.fn().mockResolvedValue({
          ...jitResult(instanceId),
          runnerName: 'runner-owned-by-another-config',
        }),
        removeRunner,
      }),
    );

    expect(result).toMatchObject({
      status: 'non_retryable_error',
      currentRunners: 0,
      actions: { launched: 0, terminated: 1 },
      errors: [expect.objectContaining({ operation: 'generate_jit_configuration', retryable: false })],
    });
    expect(removeRunner).not.toHaveBeenCalled();
    expect(ssmMock).not.toHaveReceivedCommand(PutParameterCommand);
    expect(ec2Mock).toHaveReceivedCommandWith(TerminateInstancesCommand, { InstanceIds: [instanceId] });
  });

  it('retains compute when failed JIT publication cannot be safely cancelled', async () => {
    const instanceId = 'i-1234567890abcdef0';
    ec2Mock.on(DescribeInstancesCommand).resolves({});
    ec2Mock.on(CreateFleetCommand).resolves({ Instances: [{ InstanceIds: [instanceId] }] });
    ssmMock.on(PutParameterCommand).rejects(Object.assign(new Error('redacted secret'), { name: 'TimeoutError' }));
    ssmMock.on(DeleteParameterCommand).rejects(Object.assign(new Error('missing'), { name: 'ParameterNotFound' }));
    const removeRunner = vi.fn();

    const result = await provider().reconcile(createRequest({ removeRunner }));

    expect(result).toMatchObject({
      status: 'retryable_error',
      currentRunners: 1,
      actions: { launched: 0, terminated: 0, retainedUnknown: 1 },
      errors: [expect.objectContaining({ operation: 'publish_jit_configuration', code: 'TimeoutError' })],
    });
    expect(JSON.stringify(result)).not.toContain('redacted secret');
    expect(removeRunner).not.toHaveBeenCalled();
    expect(ec2Mock).not.toHaveReceivedCommand(TerminateInstancesCommand);
  });

  it('does not treat a successful DeleteParameter as proof that bootstrap did not read JIT first', async () => {
    const instanceId = 'i-1234567890abcdef0';
    ec2Mock.on(DescribeInstancesCommand).resolves({});
    ec2Mock.on(CreateFleetCommand).resolves({ Instances: [{ InstanceIds: [instanceId] }] });
    ssmMock.on(PutParameterCommand).rejects(Object.assign(new Error('throttled'), { name: 'ThrottlingException' }));
    ssmMock.on(DeleteParameterCommand).resolves({});
    const removeRunner = vi.fn().mockResolvedValue({ status: 'removed' });

    const result = await provider().reconcile(createRequest({ removeRunner }));

    expect(result).toMatchObject({
      status: 'retryable_error',
      currentRunners: 1,
      actions: { launched: 0, terminated: 0, retainedUnknown: 1 },
    });
    expect(ssmMock).toHaveReceivedCommandWith(DeleteParameterCommand, {
      Name: `${config.jitConfigParameterPath}/${instanceId}`,
    });
    expect(removeRunner).not.toHaveBeenCalled();
    expect(ec2Mock).not.toHaveReceivedCommand(TerminateInstancesCommand);
  });

  it('terminates only exact known-idle or completed runners and retains busy or unknown runners', async () => {
    const completed = ownedInstance('i-completed', { runnerId: 101, runnerName: 'runner-completed' });
    const busy = ownedInstance('i-busy', { runnerId: 102, runnerName: 'runner-busy' });
    const unknown = ownedInstance('i-unknown', { runnerId: 103, runnerName: 'runner-unknown' });
    ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [{ Instances: [completed, busy, unknown] }] });
    const removeRunner = vi.fn().mockResolvedValue({ status: 'removed' });

    const result = await provider().reconcile(
      createRequest({
        desiredRunners: 2,
        runnerInventoryComplete: true,
        runnerStates: [
          githubState(101, 'runner-completed', { status: 'offline', busy: undefined, lifecycle: 'completed' }),
          githubState(102, 'runner-busy', { busy: true, lifecycle: 'started' }),
        ],
        removeRunner,
      }),
    );

    expect(result).toEqual({
      status: 'converged',
      desiredRunners: 2,
      currentRunners: 2,
      needsRunnerInventory: false,
      actions: { launched: 0, terminated: 1, retainedBusy: 1, retainedUnknown: 1 },
      errors: [],
    });
    expect(removeRunner).toHaveBeenCalledTimes(1);
    expect(removeRunner).toHaveBeenCalledWith({
      runnerId: 101,
      runnerName: 'runner-completed',
      scaleSetId: 42,
      signal,
    });
    expect(ec2Mock).toHaveReceivedCommandWith(TerminateInstancesCommand, { InstanceIds: ['i-completed'] });
    expect(ec2Mock).not.toHaveReceivedCommandWith(TerminateInstancesCommand, { InstanceIds: ['i-busy'] });
    expect(ec2Mock).not.toHaveReceivedCommandWith(TerminateInstancesCommand, { InstanceIds: ['i-unknown'] });
  });

  it('uses a typed inventory signal for a conservative first pass and exact second pass', async () => {
    const instance = ownedInstance('i-completed', { runnerId: 101, runnerName: 'runner-completed' });
    ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [{ Instances: [instance] }] });
    const removeRunner = vi.fn().mockResolvedValue({ status: 'removed' });
    const computeProvider = provider();

    const firstPass = await computeProvider.reconcile(
      createRequest({ desiredRunners: 0, runnerStates: [], removeRunner }),
    );

    expect(firstPass).toMatchObject({
      status: 'retained',
      currentRunners: 1,
      needsRunnerInventory: true,
      actions: { terminated: 0, retainedUnknown: 1 },
      errors: [],
    });
    expect(removeRunner).not.toHaveBeenCalled();

    const secondPass = await computeProvider.reconcile(
      createRequest({
        desiredRunners: 0,
        runnerInventoryComplete: true,
        runnerStates: [githubState(101, 'runner-completed', { lifecycle: 'completed', status: 'offline' })],
        removeRunner,
      }),
    );

    expect(secondPass).toMatchObject({
      status: 'converged',
      currentRunners: 0,
      needsRunnerInventory: false,
      actions: { terminated: 1 },
    });
    expect(removeRunner).toHaveBeenCalledTimes(1);
  });

  it('never lets a completed lifecycle marker override a current busy signal', async () => {
    const instance = ownedInstance('i-completed-busy', { runnerId: 101, runnerName: 'runner-completed-busy' });
    ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [{ Instances: [instance] }] });
    const removeRunner = vi.fn();

    const result = await provider().reconcile(
      createRequest({
        desiredRunners: 0,
        runnerInventoryComplete: true,
        runnerStates: [
          githubState(101, 'runner-completed-busy', {
            lifecycle: 'completed',
            status: 'online',
            busy: true,
          }),
        ],
        removeRunner,
      }),
    );

    expect(result).toMatchObject({
      status: 'retained',
      currentRunners: 1,
      needsRunnerInventory: false,
      actions: { terminated: 0, retainedBusy: 1 },
      errors: [],
    });
    expect(removeRunner).not.toHaveBeenCalled();
    expect(ec2Mock).not.toHaveReceivedCommand(TerminateInstancesCommand);
  });

  it('retains a runner without an error when the exact removal check observes that it became busy', async () => {
    const instance = ownedInstance('i-raced-busy', { runnerId: 101, runnerName: 'runner-raced-busy' });
    ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [{ Instances: [instance] }] });
    const removeRunner = vi.fn().mockResolvedValue({ status: 'retained_busy' });

    const result = await provider().reconcile(
      createRequest({
        desiredRunners: 0,
        runnerInventoryComplete: true,
        runnerStates: [githubState(101, 'runner-raced-busy')],
        removeRunner,
      }),
    );

    expect(result).toMatchObject({
      status: 'retained',
      currentRunners: 1,
      needsRunnerInventory: false,
      actions: { terminated: 0, retainedBusy: 1, retainedUnknown: 0 },
      errors: [],
    });
    expect(ec2Mock).not.toHaveReceivedCommand(TerminateInstancesCommand);
  });

  it('retains a runner and requests inventory when exact removal observes identity drift', async () => {
    const instance = ownedInstance('i-raced-unknown', { runnerId: 101, runnerName: 'runner-raced-unknown' });
    ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [{ Instances: [instance] }] });
    const removeRunner = vi.fn().mockResolvedValue({ status: 'retained_unknown' });

    const result = await provider().reconcile(
      createRequest({
        desiredRunners: 0,
        runnerInventoryComplete: true,
        runnerStates: [githubState(101, 'runner-raced-unknown')],
        removeRunner,
      }),
    );

    expect(result).toMatchObject({
      status: 'retained',
      currentRunners: 1,
      needsRunnerInventory: false,
      actions: { terminated: 0, retainedBusy: 0, retainedUnknown: 1 },
      errors: [],
    });
    expect(ec2Mock).not.toHaveReceivedCommand(TerminateInstancesCommand);
  });

  it('does not trust a mutable EC2 GitHub-runner-id tag when controller identity disagrees', async () => {
    const instance = ownedInstance('i-mismatch', { runnerId: 999, runnerName: 'runner-exact' });
    ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [{ Instances: [instance] }] });
    const removeRunner = vi.fn();

    const result = await provider().reconcile(
      createRequest({
        desiredRunners: 0,
        runnerInventoryComplete: true,
        runnerStates: [githubState(101, 'runner-exact')],
        removeRunner,
      }),
    );

    expect(result).toMatchObject({
      status: 'retained',
      currentRunners: 1,
      actions: { terminated: 0, retainedUnknown: 1 },
      errors: [],
    });
    expect(removeRunner).not.toHaveBeenCalled();
    expect(ec2Mock).not.toHaveReceivedCommand(TerminateInstancesCommand);
  });

  it('does not terminate compute when exact GitHub removal fails', async () => {
    const instance = ownedInstance('i-idle', { runnerId: 101, runnerName: 'runner-idle' });
    ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [{ Instances: [instance] }] });
    const removeRunner = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('must not leak'), { name: 'ServiceUnavailable' }));

    const result = await provider().reconcile(
      createRequest({
        desiredRunners: 0,
        runnerInventoryComplete: true,
        runnerStates: [githubState(101, 'runner-idle')],
        removeRunner,
      }),
    );

    expect(result).toMatchObject({
      status: 'retryable_error',
      currentRunners: 1,
      actions: { terminated: 0, retainedUnknown: 1 },
      errors: expect.arrayContaining([expect.objectContaining({ operation: 'remove_runner', retryable: true })]),
    });
    expect(JSON.stringify(result)).not.toContain('must not leak');
    expect(ec2Mock).not.toHaveReceivedCommand(TerminateInstancesCommand);
  });

  it('rejects an invalid desired count without touching AWS', async () => {
    const result = await provider().reconcile(createRequest({ desiredRunners: -1 }));

    expect(result).toMatchObject({
      status: 'non_retryable_error',
      desiredRunners: -1,
      currentRunners: 0,
      errors: [{ operation: 'validate', code: 'INVALID_DESIRED_RUNNER_COUNT', retryable: false }],
    });
    expect(ec2Mock).not.toHaveReceivedCommand(DescribeInstancesCommand);
  });

  it.each([0, 121, 1.5])('rejects invalid orchestration boot timeout %s without touching AWS', async (value) => {
    const result = await provider().reconcile(createRequest({ bootTimeoutMinutes: value }));

    expect(result).toMatchObject({
      status: 'non_retryable_error',
      currentRunners: 0,
      errors: [{ operation: 'validate', code: 'INVALID_BOOT_TIMEOUT', retryable: false }],
    });
    expect(ec2Mock).not.toHaveReceivedCommand(DescribeInstancesCommand);
  });

  it('propagates cancellation instead of converting shutdown into a retry result', async () => {
    const abort = new AbortController();
    abort.abort(new Error('service stopping'));

    await expect(provider().reconcile(createRequest({ signal: abort.signal }))).rejects.toThrow('service stopping');
    expect(ec2Mock).not.toHaveReceivedCommand(DescribeInstancesCommand);
  });
});
