import { createSingleMetric } from '@aws-github-runner/aws-powertools-util';
import type { RunnerConfigStorage, RunnerConfigStore } from '@aws-github-runner/storage-providers';
import type { Octokit } from '@octokit/rest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateGitHubRunnerConfig, CreateStartRunnerConfig, StandbyInstance } from '../../../../core';
import type { Ec2RunnerProvisioningOperations } from '../runners';
import type { WarmLeaseStore } from '../warm-lease';
import { createEc2ScaleUpCapability } from './scale-up';
import type { Ec2WarmActivationOperations } from './warm-activation';

vi.mock('@aws-github-runner/aws-powertools-util', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@aws-github-runner/aws-powertools-util')>()),
  createSingleMetric: vi.fn(),
}));

const NOW = new Date('2026-09-30T12:00:00.000Z');
const MINUTE = 60 * 1000;
const ENVIRONMENT = 'unit-test-environment';
const POOL_OWNER = ENVIRONMENT;
const JOB_OWNER = 'job-org/hello-world';
const githubClient = {} as Octokit;
const cleanEnv = process.env;

const ec2Operations = {
  list: vi.fn<Ec2RunnerProvisioningOperations['list']>(),
  create: vi.fn<Ec2RunnerProvisioningOperations['create']>(),
  terminate: vi.fn<Ec2RunnerProvisioningOperations['terminate']>(),
  tag: vi.fn<Ec2RunnerProvisioningOperations['tag']>(),
  untag: vi.fn<Ec2RunnerProvisioningOperations['untag']>(),
  getDefaultBlockDeviceNameFromLaunchTemplate:
    vi.fn<Ec2RunnerProvisioningOperations['getDefaultBlockDeviceNameFromLaunchTemplate']>(),
} satisfies Ec2RunnerProvisioningOperations;
const standby = {
  listStandby: vi.fn<Ec2WarmActivationOperations['standby']['listStandby']>(),
  startInstance: vi.fn<Ec2WarmActivationOperations['standby']['startInstance']>(),
  cancelSpotRequest: vi.fn<Ec2WarmActivationOperations['standby']['cancelSpotRequest']>(),
};
const lease = {
  claim: vi.fn<WarmLeaseStore['claim']>(),
  release: vi.fn<WarmLeaseStore['release']>(),
};
const createLeaseStore = vi.fn<Ec2WarmActivationOperations['createLeaseStore']>(() => lease);
const runnerConfigStore = {
  create: vi.fn<RunnerConfigStore['create']>(),
  delete: vi.fn<RunnerConfigStore['delete']>(),
};
const storage = { runnerConfig: runnerConfigStore } as unknown as RunnerConfigStorage;
const mockCreateStartRunnerConfig = vi.fn<CreateStartRunnerConfig>();
const capability = createEc2ScaleUpCapability(ec2Operations, mockCreateStartRunnerConfig, {
  standby,
  createLeaseStore,
});

const githubRunnerConfig: CreateGitHubRunnerConfig = {
  ephemeral: true,
  enableJitConfig: true,
  runnerLabels: 'label1,label2',
  runnerGroup: 'Default',
  runnerNamePrefix: 'unit-test-',
  runnerOwner: JOB_OWNER,
  runnerType: 'Repo',
  disableAutoUpdate: false,
};

function warm(instanceId: string, ageInMinutes: number, overrides: Partial<StandbyInstance> = {}): StandbyInstance {
  return {
    instanceId,
    state: 'WARM',
    launchTime: new Date(NOW.getTime() - ageInMinutes * MINUTE),
    ...overrides,
  };
}

async function createRunners(numberOfRunners = 1, labels: string[] = []) {
  const { state } = await capability.resolveLabelsForRunners(labels);
  return await capability.createRunners({
    githubRunnerConfig,
    numberOfRunners,
    githubInstallationClient: githubClient,
    state,
    storage,
  });
}

function callOrder(mock: { mock: { invocationCallOrder: number[] } }, index = 0): number {
  return mock.mock.invocationCallOrder[index];
}

function expectRolledBack(instanceId: string) {
  expect(runnerConfigStore.delete).toHaveBeenCalledWith(instanceId);
  expect(ec2Operations.untag).toHaveBeenCalledWith(instanceId, [{ Key: 'ghr:warm-activated' }]);
  expect(ec2Operations.tag).toHaveBeenCalledWith(instanceId, [
    { Key: 'ghr:Owner', Value: POOL_OWNER },
    { Key: 'ghr:Type', Value: 'Org' },
  ]);
  expect(lease.release).toHaveBeenCalledWith(instanceId);
}

function expectFallbackMetric(reason: string, count: number) {
  expect(createSingleMetric).toHaveBeenCalledWith('WarmPoolActivationFallbacks', 'Count', count, {
    Environment: ENVIRONMENT,
    Reason: reason,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  process.env = { ...cleanEnv };
  process.env.ENVIRONMENT = ENVIRONMENT;
  process.env.LAUNCH_TEMPLATE_NAME = 'lt-1';
  process.env.SUBNET_IDS = 'subnet-123';
  process.env.INSTANCE_TYPES = 'm5.large';
  process.env.INSTANCE_TARGET_CAPACITY_TYPE = 'spot';
  process.env.SCALE_ERRORS = '["UnfulfillableCapacity"]';
  process.env.WARM_POOL_ENABLED = 'true';
  process.env.WARM_POOL_LEASE_TABLE_NAME = 'warm-leases';
  process.env.RUNNER_OWNER = POOL_OWNER;
  process.env.ENABLE_METRIC_WARM_POOL = 'true';
  delete process.env.INSTANCE_TYPE_PRIORITIES;
  delete process.env.INSTANCE_MAX_SPOT_PRICE;
  delete process.env.INSTANCE_ALLOCATION_STRATEGY;
  delete process.env.AMI_ID_SSM_PARAMETER_NAME;
  delete process.env.POWERTOOLS_TRACE_ENABLED;
  delete process.env.ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS;
  delete process.env.USE_DEDICATED_HOST;

  ec2Operations.create.mockImplementation(async ({ numberOfRunners }) => ({
    instances: Array.from({ length: numberOfRunners }, (_, index) => `i-cold-${index + 1}`),
    failedInstanceCount: 0,
    failureCodes: [],
  }));
  ec2Operations.tag.mockResolvedValue(undefined);
  ec2Operations.untag.mockResolvedValue(undefined);
  standby.listStandby.mockResolvedValue([
    warm('i-old', 60),
    warm('i-new', 5),
    { instanceId: 'i-priming', state: 'PRIMING', launchTime: NOW },
  ]);
  standby.startInstance.mockResolvedValue(undefined);
  standby.cancelSpotRequest.mockResolvedValue(undefined);
  lease.claim.mockResolvedValue(true);
  lease.release.mockResolvedValue(undefined);
  runnerConfigStore.create.mockResolvedValue(undefined);
  runnerConfigStore.delete.mockResolvedValue(undefined);
  mockCreateStartRunnerConfig.mockImplementation(async (config, runnerIds, _client, options) => {
    for (const runnerId of runnerIds) {
      await options?.onJitConfigCreated?.(runnerId, { githubRunnerId: '42', runnerLabels: ['label1', 'label2'] });
      await options?.runnerConfigStore?.create({ runnerId, value: 'encoded-jit-config' });
    }
    return [];
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('warm pool activation in EC2 scale-up', () => {
  it('launches cold without touching the warm pool when warm mode is disabled', async () => {
    delete process.env.WARM_POOL_ENABLED;

    const result = await createRunners();

    expect(result).toEqual({ instances: ['i-cold-1'], retryableErrorCount: 0, nonRetryableErrorCount: 0 });
    expect(standby.listStandby).not.toHaveBeenCalled();
    expect(createLeaseStore).not.toHaveBeenCalled();
    expect(ec2Operations.create).toHaveBeenCalledWith(expect.objectContaining({ numberOfRunners: 1 }));
    expect(createSingleMetric).not.toHaveBeenCalled();
  });

  it('launches cold when dynamic EC2 overrides are requested', async () => {
    const result = await createRunners(1, ['ghr-ec2-instance-type:c5.large']);

    expect(result.instances).toEqual(['i-cold-1']);
    expect(standby.listStandby).not.toHaveBeenCalled();
  });

  it('activates the newest warm instance instead of launching cold', async () => {
    const result = await createRunners();

    expect(result).toEqual({ instances: ['i-new'], retryableErrorCount: 0, nonRetryableErrorCount: 0 });
    expect(standby.listStandby).toHaveBeenCalledWith({
      environment: ENVIRONMENT,
      runnerOwner: POOL_OWNER,
      runnerType: 'Org',
    });
    expect(createLeaseStore).toHaveBeenCalledWith('warm-leases');
    expect(lease.claim).toHaveBeenCalledTimes(1);
    expect(lease.claim).toHaveBeenCalledWith('i-new');
    expect(ec2Operations.tag).toHaveBeenNthCalledWith(1, 'i-new', [
      { Key: 'ghr:warm-activated', Value: NOW.toISOString() },
      { Key: 'ghr:Owner', Value: JOB_OWNER },
      { Key: 'ghr:Type', Value: 'Repo' },
    ]);
    expect(mockCreateStartRunnerConfig).toHaveBeenCalledWith(
      githubRunnerConfig,
      ['i-new'],
      githubClient,
      expect.objectContaining({ runnerConfigStore }),
    );
    expect(ec2Operations.tag).toHaveBeenCalledWith('i-new', [
      { Key: 'ghr:github_runner_id', Value: '42' },
      { Key: 'ghr:runner_labels', Value: 'label1,label2' },
    ]);
    expect(standby.startInstance).toHaveBeenCalledWith('i-new');
    expect(standby.cancelSpotRequest).not.toHaveBeenCalled();
    expect(ec2Operations.create).not.toHaveBeenCalled();
    expect(lease.release).not.toHaveBeenCalled();
  });

  it('writes the runner config and activation tag before starting the instance', async () => {
    await createRunners();

    const start = callOrder(standby.startInstance);
    expect(callOrder(ec2Operations.tag)).toBeLessThan(start);
    expect(callOrder(runnerConfigStore.create)).toBeLessThan(start);
  });

  it('defaults the pool owner to the environment', async () => {
    delete process.env.RUNNER_OWNER;

    await createRunners();

    expect(standby.listStandby).toHaveBeenCalledWith({
      environment: ENVIRONMENT,
      runnerOwner: ENVIRONMENT,
      runnerType: 'Org',
    });
  });

  it('activates warm instances first and launches the remainder cold', async () => {
    const result = await createRunners(4);

    expect(result).toEqual({
      instances: ['i-new', 'i-old', 'i-cold-1', 'i-cold-2'],
      retryableErrorCount: 0,
      nonRetryableErrorCount: 0,
    });
    expect(ec2Operations.create).toHaveBeenCalledWith(expect.objectContaining({ numberOfRunners: 2 }));
    expectFallbackMetric('no-warm-instance', 2);
  });

  describe('spot instances', () => {
    beforeEach(() => {
      standby.listStandby.mockResolvedValue([warm('i-spot', 5, { spotInstanceRequestId: 'sir-1' })]);
    });

    it('cancels the spot request right after a successful start', async () => {
      const result = await createRunners();

      expect(result.instances).toEqual(['i-spot']);
      expect(standby.cancelSpotRequest).toHaveBeenCalledWith('sir-1');
      expect(callOrder(standby.startInstance)).toBeLessThan(callOrder(standby.cancelSpotRequest));
    });

    it('keeps the activation when cancelling the spot request fails', async () => {
      standby.cancelSpotRequest.mockRejectedValue(new Error('cancel failed'));

      const result = await createRunners();

      expect(result).toEqual({ instances: ['i-spot'], retryableErrorCount: 0, nonRetryableErrorCount: 0 });
      expect(ec2Operations.untag).not.toHaveBeenCalled();
      expect(lease.release).not.toHaveBeenCalled();
    });

    it('does not cancel the spot request when the start fails', async () => {
      standby.startInstance.mockRejectedValue(new Error('IncorrectSpotRequestState'));

      await createRunners();

      expect(standby.cancelSpotRequest).not.toHaveBeenCalled();
    });
  });

  describe('claim lease', () => {
    it('tries the next warm instance when a claim is lost', async () => {
      lease.claim.mockResolvedValueOnce(false);

      const result = await createRunners();

      expect(result.instances).toEqual(['i-old']);
      expect(lease.claim.mock.calls).toEqual([['i-new'], ['i-old']]);
      expect(ec2Operations.create).not.toHaveBeenCalled();
    });

    it('launches cold when every claim is lost', async () => {
      lease.claim.mockResolvedValue(false);

      const result = await createRunners();

      expect(result.instances).toEqual(['i-cold-1']);
      expect(ec2Operations.tag).not.toHaveBeenCalledWith('i-new', expect.anything());
      expectFallbackMetric('claim-lost', 1);
    });

    it('lets exactly one of two concurrent invocations activate the same warm instance', async () => {
      standby.listStandby.mockResolvedValue([warm('i-new', 5)]);
      const held = new Set<string>();
      lease.claim.mockImplementation(async (instanceId) => {
        await Promise.resolve();
        if (held.has(instanceId)) return false;
        held.add(instanceId);
        return true;
      });

      const results = await Promise.all([createRunners(), createRunners()]);

      expect(results.map(({ instances }) => instances).sort()).toEqual([['i-cold-1'], ['i-new']]);
      expect(standby.startInstance).toHaveBeenCalledTimes(1);
      expectFallbackMetric('claim-lost', 1);
    });

    it('skips warm activation when the lease table is unavailable', async () => {
      lease.claim.mockRejectedValue(Object.assign(new Error('missing'), { name: 'ResourceNotFoundException' }));

      const result = await createRunners(2);

      expect(result.instances).toEqual(['i-cold-1', 'i-cold-2']);
      expect(lease.claim).toHaveBeenCalledTimes(1);
      expect(ec2Operations.tag).not.toHaveBeenCalledWith('i-new', expect.anything());
      expectFallbackMetric('lease-unavailable', 2);
    });

    it('releases held claims when the lease table fails part way', async () => {
      lease.claim
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(Object.assign(new Error('throttled'), { name: 'ThrottlingException' }));

      const result = await createRunners(2);

      expect(lease.release).toHaveBeenCalledWith('i-new');
      expect(result.instances).toEqual(['i-cold-1', 'i-cold-2']);
      expect(standby.startInstance).not.toHaveBeenCalled();
      expectFallbackMetric('lease-unavailable', 2);
    });

    it('skips warm activation when no lease table is configured', async () => {
      delete process.env.WARM_POOL_LEASE_TABLE_NAME;

      const result = await createRunners();

      expect(result.instances).toEqual(['i-cold-1']);
      expect(standby.listStandby).not.toHaveBeenCalled();
      expectFallbackMetric('lease-unavailable', 1);
    });
  });

  describe('fallback to cold', () => {
    it('launches cold when no warm instance is available', async () => {
      standby.listStandby.mockResolvedValue([{ instanceId: 'i-priming', state: 'PRIMING' }]);

      const result = await createRunners();

      expect(result.instances).toEqual(['i-cold-1']);
      expect(lease.claim).not.toHaveBeenCalled();
      expectFallbackMetric('no-warm-instance', 1);
    });

    it('launches cold when the warm pool cannot be listed', async () => {
      standby.listStandby.mockRejectedValue(new Error('describe failed'));

      const result = await createRunners();

      expect(result.instances).toEqual(['i-cold-1']);
      expectFallbackMetric('no-warm-instance', 1);
    });

    it('rolls back the activation and launches cold when the start fails', async () => {
      standby.startInstance.mockRejectedValue(
        Object.assign(new Error('capacity'), { name: 'InsufficientInstanceCapacity' }),
      );

      const result = await createRunners();

      expect(result).toEqual({ instances: ['i-cold-1'], retryableErrorCount: 0, nonRetryableErrorCount: 0 });
      expectRolledBack('i-new');
      expect(callOrder(lease.release)).toBeLessThan(callOrder(ec2Operations.create));
      expect(ec2Operations.create).toHaveBeenCalledWith(expect.objectContaining({ numberOfRunners: 1 }));
      expectFallbackMetric('start-failed', 1);
    });

    it('rolls back and launches cold when the activation tags cannot be written', async () => {
      ec2Operations.tag.mockRejectedValueOnce(new Error('tag failed'));

      const result = await createRunners();

      expect(result.instances).toEqual(['i-cold-1']);
      expectRolledBack('i-new');
      expect(mockCreateStartRunnerConfig).toHaveBeenCalledTimes(1);
      expect(mockCreateStartRunnerConfig).toHaveBeenCalledWith(
        githubRunnerConfig,
        ['i-cold-1'],
        githubClient,
        expect.anything(),
      );
      expect(standby.startInstance).not.toHaveBeenCalled();
      expectFallbackMetric('start-failed', 1);
    });

    it('continues the rollback when a rollback step fails', async () => {
      standby.startInstance.mockRejectedValue(new Error('IncorrectInstanceState'));
      runnerConfigStore.delete.mockRejectedValue(new Error('ssm down'));
      ec2Operations.untag.mockRejectedValue(new Error('untag failed'));

      const result = await createRunners();

      expect(result.instances).toEqual(['i-cold-1']);
      expectRolledBack('i-new');
    });
  });

  it('rolls back and reports a retryable error when the runner config cannot be created', async () => {
    mockCreateStartRunnerConfig.mockResolvedValue(['i-new']);

    const result = await createRunners();

    expect(result).toEqual({ instances: [], retryableErrorCount: 1, nonRetryableErrorCount: 0 });
    expectRolledBack('i-new');
    expect(standby.startInstance).not.toHaveBeenCalled();
    expect(ec2Operations.create).not.toHaveBeenCalled();
  });

  it('rolls back every claimed instance when runner config creation throws', async () => {
    mockCreateStartRunnerConfig.mockRejectedValue(new Error('GitHub down'));

    const result = await createRunners(2);

    expect(result).toEqual({ instances: [], retryableErrorCount: 2, nonRetryableErrorCount: 0 });
    expectRolledBack('i-new');
    expectRolledBack('i-old');
  });

  describe('metrics', () => {
    it('publishes activations', async () => {
      await createRunners();

      expect(vi.mocked(createSingleMetric).mock.calls).toEqual([
        ['WarmPoolActivations', 'Count', 1, { Environment: ENVIRONMENT }],
      ]);
    });

    it('publishes nothing when warm pool metrics are disabled', async () => {
      delete process.env.ENABLE_METRIC_WARM_POOL;
      standby.listStandby.mockResolvedValue([]);

      await createRunners();

      expect(createSingleMetric).not.toHaveBeenCalled();
    });
  });
});
