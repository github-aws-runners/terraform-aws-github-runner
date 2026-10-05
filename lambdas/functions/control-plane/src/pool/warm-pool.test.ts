import { createSingleMetric } from '@aws-github-runner/aws-powertools-util';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PoolStandbyOperations, StandbyInstance, StandbySpotRequest } from './pool-provider';
import { adjustWarmPool } from './warm-pool';

vi.mock('@aws-github-runner/aws-powertools-util', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@aws-github-runner/aws-powertools-util')>()),
  createSingleMetric: vi.fn(),
}));

const NOW = new Date('2026-09-30T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const ENVIRONMENT = 'unit-test-environment';
const POOL_INPUT = { environment: ENVIRONMENT, runnerOwner: ENVIRONMENT, runnerType: 'Org' };

const standby = {
  list: vi.fn<PoolStandbyOperations['list']>(),
  launch: vi.fn<PoolStandbyOperations['launch']>(),
  destroy: vi.fn<PoolStandbyOperations['destroy']>(),
  cancelSpotRequests: vi.fn<NonNullable<PoolStandbyOperations['cancelSpotRequests']>>(),
  currentImage: vi.fn<NonNullable<PoolStandbyOperations['currentImage']>>(),
} satisfies PoolStandbyOperations;
const provider = { type: 'aws-ec2', standby };

const cleanEnv = process.env;

function mockListing(
  instances: StandbyInstance[],
  orphanedSpotRequests: StandbySpotRequest[] = [],
  spotStateKnown = true,
): void {
  standby.list.mockResolvedValue({ instances, orphanedSpotRequests, spotStateKnown });
}

function instance(
  instanceId: string,
  state: StandbyInstance['state'],
  ageInMs: number,
  overrides: Partial<StandbyInstance> = {},
): StandbyInstance {
  return {
    instanceId,
    state,
    launchTime: new Date(NOW.getTime() - ageInMs),
    imageId: 'ami-current',
    launchTemplateVersion: '3',
    ...overrides,
  };
}

function destroyedIds(): string[] {
  return standby.destroy.mock.calls.flatMap(([instances]) => instances.map((i) => i.instanceId));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  process.env = { ...cleanEnv };
  process.env.ENVIRONMENT = ENVIRONMENT;
  process.env.RUNNER_OWNER = 'my-org';
  delete process.env.WARM_POOL_MAX_AGE_HOURS;
  delete process.env.RUNNER_BOOT_TIME_IN_MINUTES;
  delete process.env.ENABLE_METRIC_WARM_POOL;

  mockListing([]);
  standby.launch.mockImplementation(async ({ numberOfInstances }) => ({
    instances: Array.from({ length: numberOfInstances }, (_, i) => `i-new-${i}`),
    retryableErrorCount: 0,
    nonRetryableErrorCount: 0,
  }));
  standby.destroy.mockImplementation(async (instances) => ({
    succeeded: instances.map((i) => i.instanceId),
    failed: [],
  }));
  standby.cancelSpotRequests.mockImplementation(async (requests) => ({
    succeeded: requests.map((request) => request.spotInstanceRequestId),
    failed: [],
  }));
  standby.currentImage.mockResolvedValue({ imageId: 'ami-current', launchTemplateVersion: '3' });
});

describe('adjustWarmPool', () => {
  it('throws when the provider has no standby capability', async () => {
    await expect(adjustWarmPool({ type: 'aws-ec2' }, 2)).rejects.toThrow(
      "Compute provider 'aws-ec2' does not support a warm pool.",
    );
  });

  it('lists and launches with the environment as owner and the Org type', async () => {
    await adjustWarmPool(provider, 2);

    expect(standby.list).toHaveBeenCalledWith(POOL_INPUT);
    expect(standby.launch).toHaveBeenCalledWith({ ...POOL_INPUT, numberOfInstances: 2, maxAgeHours: 168 });
  });

  it('ignores RUNNER_OWNER for the warm pool owner tag', async () => {
    process.env.RUNNER_OWNER = 'my-org';

    await adjustWarmPool(provider, 1);

    expect(standby.list).toHaveBeenCalledWith(POOL_INPUT);
  });

  it('passes the configured max age to launched instances', async () => {
    process.env.WARM_POOL_MAX_AGE_HOURS = '24';

    await adjustWarmPool(provider, 1);

    expect(standby.launch).toHaveBeenCalledWith(expect.objectContaining({ maxAgeHours: 24 }));
  });

  describe('eviction', () => {
    it('destroys WARM instances older than the max age', async () => {
      process.env.WARM_POOL_MAX_AGE_HOURS = '10';
      mockListing([
        instance('i-old', 'WARM', 11 * HOUR, { spotInstanceRequestId: 'sir-old' }),
        instance('i-young', 'WARM', 9 * HOUR),
      ]);

      await adjustWarmPool(provider, 2);

      expect(standby.destroy).toHaveBeenCalledWith([{ instanceId: 'i-old', spotInstanceRequestId: 'sir-old' }]);
      expect(standby.launch).toHaveBeenCalledWith(expect.objectContaining({ numberOfInstances: 1 }));
    });

    it('destroys WARM instances whose AMI or launch template version drifted', async () => {
      mockListing([
        instance('i-ami', 'WARM', HOUR, { imageId: 'ami-old' }),
        instance('i-lt', 'WARM', HOUR, { launchTemplateVersion: '2' }),
        instance('i-current', 'WARM', HOUR),
      ]);

      await adjustWarmPool(provider, 3);

      expect(destroyedIds()).toEqual(['i-ami', 'i-lt']);
      expect(standby.launch).toHaveBeenCalledWith(expect.objectContaining({ numberOfInstances: 2 }));
    });

    it('skips drift checks for values that cannot be determined', async () => {
      standby.currentImage.mockResolvedValue({ launchTemplateVersion: '3' });
      mockListing([instance('i-ami', 'WARM', HOUR, { imageId: 'ami-other' })]);

      await adjustWarmPool(provider, 1);

      expect(standby.destroy).not.toHaveBeenCalled();
    });

    it('skips drift checks when the provider cannot resolve the current image', async () => {
      const withoutCurrentImage = { ...standby, currentImage: undefined };
      mockListing([instance('i-ami', 'WARM', HOUR, { imageId: 'ami-other' })]);

      await adjustWarmPool({ type: 'aws-ec2', standby: withoutCurrentImage }, 1);

      expect(standby.destroy).not.toHaveBeenCalled();
    });

    it('destroys the oldest WARM instances above the target', async () => {
      mockListing([
        instance('i-2h', 'WARM', 2 * HOUR),
        instance('i-3h', 'WARM', 3 * HOUR),
        instance('i-1h', 'WARM', HOUR),
      ]);

      await adjustWarmPool(provider, 1);

      expect(destroyedIds()).toEqual(['i-3h', 'i-2h']);
      expect(standby.launch).not.toHaveBeenCalled();
    });

    it('destroys PRIMING instances that exceeded the boot time', async () => {
      process.env.RUNNER_BOOT_TIME_IN_MINUTES = '10';
      mockListing([instance('i-stuck', 'PRIMING', 11 * MINUTE), instance('i-booting', 'PRIMING', 9 * MINUTE)]);

      await adjustWarmPool(provider, 2);

      expect(destroyedIds()).toEqual(['i-stuck']);
      expect(standby.launch).toHaveBeenCalledWith(expect.objectContaining({ numberOfInstances: 1 }));
    });

    it('uses a five minute boot time by default', async () => {
      mockListing([instance('i-stuck', 'PRIMING', 6 * MINUTE), instance('i-booting', 'PRIMING', 4 * MINUTE)]);

      await adjustWarmPool(provider, 2);

      expect(destroyedIds()).toEqual(['i-stuck']);
    });

    it('destroys all GARBAGE instances', async () => {
      mockListing([instance('i-g1', 'GARBAGE', MINUTE), instance('i-g2', 'GARBAGE', 300 * HOUR)]);

      await adjustWarmPool(provider, 0);

      expect(destroyedIds()).toEqual(['i-g1', 'i-g2']);
    });

    it('replaces WARM instances whose start failed for lack of capacity three times', async () => {
      process.env.ENABLE_METRIC_WARM_POOL = 'true';
      mockListing([
        instance('i-failing', 'WARM', HOUR, { startFailures: 3 }),
        instance('i-retrying', 'WARM', HOUR, { startFailures: 2 }),
      ]);

      await adjustWarmPool(provider, 2);

      expect(destroyedIds()).toEqual(['i-failing']);
      expect(standby.launch).toHaveBeenCalledWith(expect.objectContaining({ numberOfInstances: 1 }));
      expect(createSingleMetric).toHaveBeenCalledWith('WarmPoolEvictions', 'Count', 1, {
        Environment: expect.any(String),
        Reason: 'start-failed',
      });
    });

    it('never touches ACTIVE instances', async () => {
      mockListing([
        instance('i-active-old', 'ACTIVE', 300 * HOUR, { imageId: 'ami-old', launchTemplateVersion: '1' }),
        instance('i-active', 'ACTIVE', MINUTE),
      ]);

      await adjustWarmPool(provider, 0);

      expect(standby.destroy).not.toHaveBeenCalled();
      expect(standby.launch).not.toHaveBeenCalled();
    });

    it('does not count ACTIVE instances toward the target', async () => {
      mockListing([instance('i-active', 'ACTIVE', MINUTE)]);

      await adjustWarmPool(provider, 1);

      expect(standby.launch).toHaveBeenCalledWith(expect.objectContaining({ numberOfInstances: 1 }));
    });

    it('drains every WARM instance at size 0 but keeps young PRIMING instances', async () => {
      mockListing([
        instance('i-w1', 'WARM', HOUR),
        instance('i-w2', 'WARM', 2 * HOUR),
        instance('i-p1', 'PRIMING', MINUTE),
      ]);

      await adjustWarmPool(provider, 0);

      expect(destroyedIds()).toEqual(['i-w2', 'i-w1']);
      expect(standby.launch).not.toHaveBeenCalled();
    });

    it('cleans up orphaned spot requests from the listing', async () => {
      const orphaned = [
        { spotInstanceRequestId: 'sir-1', state: 'active', instanceId: 'i-gone', replacementInstanceId: 'i-respawn' },
        { spotInstanceRequestId: 'sir-2', state: 'disabled', instanceId: 'i-activated' },
      ];
      mockListing([], orphaned);

      await adjustWarmPool(provider, 0);

      expect(standby.cancelSpotRequests).toHaveBeenCalledWith(orphaned);
    });

    it('does not cancel spot requests when none are orphaned', async () => {
      await adjustWarmPool(provider, 0);

      expect(standby.cancelSpotRequests).not.toHaveBeenCalled();
    });

    it('still evicts, refills and publishes metrics when spot request state could not be read', async () => {
      process.env.ENABLE_METRIC_WARM_POOL = 'true';
      mockListing([instance('i-stuck', 'PRIMING', 6 * MINUTE), instance('i-w1', 'WARM', HOUR)], [], false);

      await adjustWarmPool(provider, 2);

      expect(destroyedIds()).toEqual(['i-stuck']);
      expect(standby.launch).toHaveBeenCalledWith(expect.objectContaining({ numberOfInstances: 1 }));
      expect(vi.mocked(createSingleMetric)).toHaveBeenCalledWith('WarmPoolSpotLookupFailures', 'Count', 1, {
        Environment: ENVIRONMENT,
      });
    });
  });

  describe('refill', () => {
    it('launches the deficit counting WARM and PRIMING instances', async () => {
      mockListing([
        instance('i-w1', 'WARM', HOUR),
        instance('i-p1', 'PRIMING', MINUTE),
        instance('i-a1', 'ACTIVE', MINUTE),
      ]);

      await adjustWarmPool(provider, 5);

      expect(standby.destroy).not.toHaveBeenCalled();
      expect(standby.launch).toHaveBeenCalledWith(expect.objectContaining({ numberOfInstances: 3 }));
    });

    it('does not launch when PRIMING instances already cover the target', async () => {
      mockListing([instance('i-p1', 'PRIMING', MINUTE), instance('i-p2', 'PRIMING', MINUTE)]);

      await adjustWarmPool(provider, 1);

      expect(standby.destroy).not.toHaveBeenCalled();
      expect(standby.launch).not.toHaveBeenCalled();
    });

    it('does not clamp the refill to RUNNERS_MAXIMUM_COUNT', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1';

      await adjustWarmPool(provider, 4);

      expect(standby.launch).toHaveBeenCalledWith(expect.objectContaining({ numberOfInstances: 4 }));
    });

    it('evicts before refilling', async () => {
      mockListing([instance('i-drift', 'WARM', HOUR, { imageId: 'ami-old' })]);

      await adjustWarmPool(provider, 1);

      expect(standby.destroy.mock.invocationCallOrder[0]).toBeLessThan(standby.launch.mock.invocationCallOrder[0]);
      expect(standby.launch).toHaveBeenCalledWith(expect.objectContaining({ numberOfInstances: 1 }));
    });

    it('still counts instances whose eviction failed', async () => {
      mockListing([instance('i-drift', 'WARM', HOUR, { imageId: 'ami-old' })]);
      standby.destroy.mockResolvedValue({ succeeded: [], failed: ['i-drift'] });

      await adjustWarmPool(provider, 1);

      expect(standby.launch).not.toHaveBeenCalled();
    });
  });

  describe('metrics', () => {
    it('does not publish metrics by default', async () => {
      mockListing([instance('i-g1', 'GARBAGE', MINUTE)]);

      await adjustWarmPool(provider, 1);

      expect(createSingleMetric).not.toHaveBeenCalled();
    });

    it('publishes pool counts and successful evictions by reason', async () => {
      process.env.ENABLE_METRIC_WARM_POOL = 'true';
      process.env.WARM_POOL_MAX_AGE_HOURS = '10';
      mockListing(
        [
          instance('i-old', 'WARM', 11 * HOUR),
          instance('i-drift', 'WARM', HOUR, { imageId: 'ami-old' }),
          instance('i-w1', 'WARM', HOUR),
          instance('i-w2', 'WARM', 2 * HOUR),
          instance('i-stuck', 'PRIMING', 6 * MINUTE),
          instance('i-p1', 'PRIMING', MINUTE),
          instance('i-g1', 'GARBAGE', MINUTE),
          instance('i-g2', 'GARBAGE', MINUTE),
          instance('i-a1', 'ACTIVE', MINUTE),
        ],
        [{ spotInstanceRequestId: 'sir-1' }],
      );
      standby.destroy.mockImplementation(async (instances) => ({
        succeeded: instances.map((i) => i.instanceId).filter((id) => id !== 'i-g2'),
        failed: ['i-g2'],
      }));

      await adjustWarmPool(provider, 1);

      const dimensions = { Environment: ENVIRONMENT };
      expect(vi.mocked(createSingleMetric).mock.calls).toEqual([
        ['WarmPoolWarmInstances', 'Count', 1, dimensions],
        ['WarmPoolPrimingInstances', 'Count', 1, dimensions],
        ['WarmPoolEvictions', 'Count', 1, { ...dimensions, Reason: 'max-age' }],
        ['WarmPoolEvictions', 'Count', 1, { ...dimensions, Reason: 'drift' }],
        ['WarmPoolEvictions', 'Count', 1, { ...dimensions, Reason: 'stuck-priming' }],
        ['WarmPoolEvictions', 'Count', 1, { ...dimensions, Reason: 'garbage' }],
        ['WarmPoolEvictions', 'Count', 1, { ...dimensions, Reason: 'over-target' }],
        ['WarmPoolEvictions', 'Count', 1, { ...dimensions, Reason: 'orphaned-spot-request' }],
      ]);
    });

    it('counts launched instances as priming', async () => {
      process.env.ENABLE_METRIC_WARM_POOL = 'true';
      mockListing([instance('i-p1', 'PRIMING', MINUTE)]);
      standby.launch.mockResolvedValue({ instances: ['i-new'], retryableErrorCount: 1, nonRetryableErrorCount: 0 });

      await adjustWarmPool(provider, 3);

      expect(createSingleMetric).toHaveBeenCalledWith('WarmPoolWarmInstances', 'Count', 0, {
        Environment: ENVIRONMENT,
      });
      expect(createSingleMetric).toHaveBeenCalledWith('WarmPoolPrimingInstances', 'Count', 2, {
        Environment: ENVIRONMENT,
      });
      expect(createSingleMetric).not.toHaveBeenCalledWith('WarmPoolEvictions', expect.anything(), expect.anything(), {
        Environment: ENVIRONMENT,
        Reason: expect.any(String),
      });
    });
  });
});
