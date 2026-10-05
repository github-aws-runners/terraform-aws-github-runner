import { createSingleMetric, tracer } from '@aws-github-runner/aws-powertools-util';
import type { RunnerConfigStorage, RunnerConfigStore } from '@aws-github-runner/storage-providers';
import type { Octokit } from '@octokit/rest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ec2SdkError } from '../../../../test/aws-sdk-errors';
import type { CreateGitHubRunnerConfig, CreateStartRunnerConfig } from '../../../../core';
import type { Ec2RunnerProvisioningOperations } from '../runners';
import type { WarmIndexItem, WarmIndexStore } from '../warm-index';
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
  startInstance: vi.fn<Ec2WarmActivationOperations['standby']['startInstance']>(),
  cancelSpotRequest: vi.fn<Ec2WarmActivationOperations['standby']['cancelSpotRequest']>(),
};

const index = {
  query: vi.fn<WarmIndexStore['query']>(),
  update: vi.fn<WarmIndexStore['update']>(),
  remove: vi.fn<WarmIndexStore['remove']>(),
  removeUnclaimed: vi.fn<WarmIndexStore['removeUnclaimed']>(),
  claim: vi.fn<WarmIndexStore['claim']>(),
  release: vi.fn<WarmIndexStore['release']>(),
  markActivated: vi.fn<WarmIndexStore['markActivated']>(),
  markUnusable: vi.fn<WarmIndexStore['markUnusable']>(),
  claimReconcile: vi.fn<WarmIndexStore['claimReconcile']>(),
} satisfies WarmIndexStore;
const createIndexStore = vi.fn<Ec2WarmActivationOperations['createIndexStore']>(() => index);

function mockWarmIndex(items: WarmIndexItem[]): void {
  index.query.mockResolvedValue(items);
}
const runnerConfigStore = {
  create: vi.fn<RunnerConfigStore['create']>(),
  delete: vi.fn<RunnerConfigStore['delete']>(),
};
const storage = { runnerConfig: runnerConfigStore } as unknown as RunnerConfigStorage;
const mockCreateStartRunnerConfig = vi.fn<CreateStartRunnerConfig>();
const capability = createEc2ScaleUpCapability(ec2Operations, mockCreateStartRunnerConfig, {
  standby,
  createIndexStore,
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

function warm(instanceId: string, ageInMinutes: number, overrides: Partial<WarmIndexItem> = {}): WarmIndexItem {
  return {
    instanceId,
    state: 'WARM',
    launchTime: new Date(NOW.getTime() - ageInMinutes * MINUTE).toISOString(),
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
  expect(ec2Operations.untag).toHaveBeenCalledWith(instanceId, [
    { Key: 'ghr:warm-activated' },
    { Key: 'ghr:trace_id' },
  ]);
  expect(ec2Operations.tag).toHaveBeenCalledWith(instanceId, [
    { Key: 'ghr:Owner', Value: POOL_OWNER },
    { Key: 'ghr:Type', Value: 'Org' },
  ]);
  expect(index.release).toHaveBeenCalledWith(instanceId);
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
  process.env.WARM_POOL_INDEX_TABLE_NAME = 'warm-index';
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
  mockWarmIndex([
    warm('i-old', 60),
    warm('i-new', 5),
    { instanceId: 'i-priming', state: 'PRIMING', launchTime: NOW.toISOString() },
  ]);
  standby.startInstance.mockResolvedValue(undefined);
  standby.cancelSpotRequest.mockResolvedValue(undefined);
  index.claim.mockResolvedValue(true);
  index.release.mockResolvedValue(undefined);
  index.markActivated.mockResolvedValue(undefined);
  index.markUnusable.mockResolvedValue(undefined);
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
    expect(createIndexStore).not.toHaveBeenCalled();
    expect(ec2Operations.create).toHaveBeenCalledWith(expect.objectContaining({ numberOfRunners: 1 }));
    expect(createSingleMetric).not.toHaveBeenCalled();
  });

  it('launches cold when dynamic EC2 overrides are requested', async () => {
    const result = await createRunners(1, ['ghr-ec2-instance-type:c5.large']);

    expect(result.instances).toEqual(['i-cold-1']);
    expect(index.query).not.toHaveBeenCalled();
  });

  it('activates the newest warm instance instead of launching cold', async () => {
    const result = await createRunners();

    expect(result).toEqual({ instances: ['i-new'], retryableErrorCount: 0, nonRetryableErrorCount: 0 });
    expect(createIndexStore).toHaveBeenCalledWith('warm-index', ENVIRONMENT);
    expect(index.claim).toHaveBeenCalledTimes(1);
    expect(index.claim).toHaveBeenCalledWith('i-new');
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
    expect(index.markActivated).toHaveBeenCalledWith('i-new', NOW.toISOString());
    expect(ec2Operations.create).not.toHaveBeenCalled();
    expect(index.release).not.toHaveBeenCalled();
  });

  it('keeps the activation when recording it in the index fails', async () => {
    index.markActivated.mockRejectedValue(new Error('throttled'));

    const result = await createRunners();

    expect(result.instances).toEqual(['i-new']);
    expect(ec2Operations.untag).not.toHaveBeenCalled();
  });

  it('writes the runner config and activation tag before starting the instance', async () => {
    await createRunners();

    const start = callOrder(standby.startInstance);
    expect(callOrder(ec2Operations.tag)).toBeLessThan(start);
    expect(callOrder(runnerConfigStore.create)).toBeLessThan(start);
  });

  it('restores the environment as pool owner on rollback', async () => {
    delete process.env.RUNNER_OWNER;
    standby.startInstance.mockRejectedValue(new Error('capacity'));

    await createRunners();

    expect(ec2Operations.tag).toHaveBeenCalledWith('i-new', [
      { Key: 'ghr:Owner', Value: ENVIRONMENT },
      { Key: 'ghr:Type', Value: 'Org' },
    ]);
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
      mockWarmIndex([warm('i-spot', 5, { spotInstanceRequestId: 'sir-1' })]);
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
      expect(standby.cancelSpotRequest).toHaveBeenCalledTimes(3);
      expect(ec2Operations.untag).not.toHaveBeenCalled();
      expect(index.release).not.toHaveBeenCalled();
    });

    it('retries a failed spot request cancellation', async () => {
      standby.cancelSpotRequest.mockRejectedValueOnce(new Error('throttled'));

      await createRunners();

      expect(standby.cancelSpotRequest).toHaveBeenCalledTimes(2);
    });

    it('does not cancel the spot request when the start fails', async () => {
      standby.startInstance.mockRejectedValue(new Error('IncorrectSpotRequestState'));

      await createRunners();

      expect(standby.cancelSpotRequest).not.toHaveBeenCalled();
    });
  });

  describe('tracing', () => {
    it('tags the scale-up trace on activation when tracing is enabled', async () => {
      process.env.POWERTOOLS_TRACE_ENABLED = 'true';
      vi.spyOn(tracer, 'getRootXrayTraceId').mockReturnValue('1-scale-up-trace');

      await createRunners();

      expect(ec2Operations.tag).toHaveBeenNthCalledWith(
        1,
        'i-new',
        expect.arrayContaining([{ Key: 'ghr:trace_id', Value: '1-scale-up-trace' }]),
      );
    });

    it('does not tag a trace when tracing is disabled', async () => {
      await createRunners();

      expect(ec2Operations.tag).toHaveBeenNthCalledWith(
        1,
        'i-new',
        expect.not.arrayContaining([expect.objectContaining({ Key: 'ghr:trace_id' })]),
      );
    });
  });

  describe('claim', () => {
    it('skips warm instances that expire before the activation settles', async () => {
      mockWarmIndex([
        warm('i-expiring', 1, { expiresAt: new Date(NOW.getTime() + 5 * MINUTE).toISOString() }),
        warm('i-valid', 5, { expiresAt: new Date(NOW.getTime() + 60 * MINUTE).toISOString() }),
      ]);

      const result = await createRunners();

      expect(index.claim).not.toHaveBeenCalledWith('i-expiring');
      expect(result.instances).toEqual(['i-valid']);
    });

    it('skips warm instances with a live claim and retries expired claims', async () => {
      const nowSeconds = NOW.getTime() / 1000;
      mockWarmIndex([
        warm('i-claimed', 1, { claimOwner: 'other', claimUntil: nowSeconds + 60 }),
        warm('i-abandoned', 5, { claimOwner: 'crashed', claimUntil: nowSeconds - 60 }),
      ]);

      const result = await createRunners();

      expect(index.claim).not.toHaveBeenCalledWith('i-claimed');
      expect(result.instances).toEqual(['i-abandoned']);
    });

    it('tries the next warm instance when a claim is lost', async () => {
      index.claim.mockResolvedValueOnce(false);

      const result = await createRunners();

      expect(result.instances).toEqual(['i-old']);
      expect(index.claim.mock.calls).toEqual([['i-new'], ['i-old']]);
      expect(ec2Operations.create).not.toHaveBeenCalled();
    });

    it('launches cold when every claim is lost', async () => {
      index.claim.mockResolvedValue(false);

      const result = await createRunners();

      expect(result.instances).toEqual(['i-cold-1']);
      expect(ec2Operations.tag).not.toHaveBeenCalledWith('i-new', expect.anything());
      expectFallbackMetric('claim-lost', 1);
    });

    it('lets exactly one of two concurrent invocations activate the same warm instance', async () => {
      mockWarmIndex([warm('i-new', 5)]);
      const held = new Set<string>();
      index.claim.mockImplementation(async (instanceId) => {
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

    it('skips warm activation when the index rejects claims', async () => {
      index.claim.mockRejectedValue(Object.assign(new Error('missing'), { name: 'ResourceNotFoundException' }));

      const result = await createRunners(2);

      expect(result.instances).toEqual(['i-cold-1', 'i-cold-2']);
      expect(index.claim).toHaveBeenCalledTimes(1);
      expect(ec2Operations.tag).not.toHaveBeenCalledWith('i-new', expect.anything());
      expectFallbackMetric('index-unavailable', 2);
    });

    it('releases held claims when the index fails part way', async () => {
      index.claim
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(Object.assign(new Error('throttled'), { name: 'ThrottlingException' }));

      const result = await createRunners(2);

      expect(index.release).toHaveBeenCalledWith('i-new');
      expect(result.instances).toEqual(['i-cold-1', 'i-cold-2']);
      expect(standby.startInstance).not.toHaveBeenCalled();
      expectFallbackMetric('index-unavailable', 2);
    });

    it('skips warm activation when no index table is configured', async () => {
      delete process.env.WARM_POOL_INDEX_TABLE_NAME;

      const result = await createRunners();

      expect(result.instances).toEqual(['i-cold-1']);
      expect(createIndexStore).not.toHaveBeenCalled();
      expectFallbackMetric('index-unavailable', 1);
    });

    it('launches cold when the index cannot be read', async () => {
      index.query.mockRejectedValue(new Error('throttled'));

      const result = await createRunners();

      expect(result.instances).toEqual(['i-cold-1']);
      expect(index.claim).not.toHaveBeenCalled();
      expectFallbackMetric('index-unavailable', 1);
    });
  });

  describe('fallback to cold', () => {
    it('launches cold when no warm instance is available', async () => {
      mockWarmIndex([{ instanceId: 'i-priming', state: 'PRIMING' }]);

      const result = await createRunners();

      expect(result.instances).toEqual(['i-cold-1']);
      expect(index.claim).not.toHaveBeenCalled();
      expectFallbackMetric('no-warm-instance', 1);
    });

    it('marks a stale index entry unusable and activates the next warm instance', async () => {
      standby.startInstance.mockRejectedValueOnce(await ec2SdkError('IncorrectInstanceState'));

      const result = await createRunners();

      expect(result).toEqual({ instances: ['i-old'], retryableErrorCount: 0, nonRetryableErrorCount: 0 });
      expect(index.markUnusable).toHaveBeenCalledWith('i-new');
      expect(index.release).not.toHaveBeenCalled();
      expect(index.claim.mock.calls).toEqual([['i-new'], ['i-old']]);
      expect(ec2Operations.create).not.toHaveBeenCalled();
    });

    it('launches cold when every warm instance turns out stale', async () => {
      standby.startInstance.mockRejectedValue(await ec2SdkError('InvalidInstanceID.NotFound'));

      const result = await createRunners();

      expect(result.instances).toEqual(['i-cold-1']);
      expect(index.markUnusable.mock.calls).toEqual([['i-new'], ['i-old']]);
      expectFallbackMetric('start-failed', 1);
    });

    it('rolls back the activation and launches cold when the start fails', async () => {
      standby.startInstance.mockRejectedValue(
        Object.assign(new Error('capacity'), { name: 'InsufficientInstanceCapacity' }),
      );

      const result = await createRunners();

      expect(result).toEqual({ instances: ['i-cold-1'], retryableErrorCount: 0, nonRetryableErrorCount: 0 });
      expectRolledBack('i-new');
      expect(callOrder(index.release)).toBeLessThan(callOrder(ec2Operations.create));
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
      standby.startInstance.mockRejectedValue(new Error('capacity'));
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
      mockWarmIndex([]);

      await createRunners();

      expect(createSingleMetric).not.toHaveBeenCalled();
    });
  });
});
