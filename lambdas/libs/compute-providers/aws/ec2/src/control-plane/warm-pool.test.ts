import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Ec2PoolStandbyOperations, StandbyInstance } from '../standby-types';
import { reconcileWarmPool } from './warm-pool';

const NOW = new Date('2026-09-30T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const ENVIRONMENT = 'unit-test-environment';
const POOL_INPUT = { environment: ENVIRONMENT, runnerOwner: ENVIRONMENT, runnerType: 'Org' };

const standby = {
  list: vi.fn<Ec2PoolStandbyOperations['list']>(),
  launch: vi.fn<Ec2PoolStandbyOperations['launch']>(),
  destroy: vi.fn<Ec2PoolStandbyOperations['destroy']>(),
  listOrphanedSpotRequests: vi.fn<Ec2PoolStandbyOperations['listOrphanedSpotRequests']>(),
  cancelSpotRequests: vi.fn<Ec2PoolStandbyOperations['cancelSpotRequests']>(),
  currentImage: vi.fn<Ec2PoolStandbyOperations['currentImage']>(),
} satisfies Ec2PoolStandbyOperations;

function reconcile(desiredSize: number, overrides: { maxAgeHours?: number; bootTimeoutMinutes?: number } = {}) {
  return reconcileWarmPool(standby, {
    environment: ENVIRONMENT,
    desiredSize,
    maxAgeHours: 168,
    bootTimeoutMinutes: 5,
    ...overrides,
  });
}

function mockListing(instances: StandbyInstance[]): void {
  standby.list.mockResolvedValue(instances);
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
  standby.listOrphanedSpotRequests.mockResolvedValue([]);
  standby.cancelSpotRequests.mockImplementation(async (ids) => ({ succeeded: ids, failed: [] }));
  standby.currentImage.mockResolvedValue({ imageId: 'ami-current', launchTemplateVersion: '3' });
});

describe('reconcileWarmPool', () => {
  it('lists and launches with the environment as owner and the Org type', async () => {
    await reconcile(2, { maxAgeHours: 24 });

    expect(standby.list).toHaveBeenCalledWith(POOL_INPUT);
    expect(standby.launch).toHaveBeenCalledWith({ ...POOL_INPUT, numberOfInstances: 2, maxAgeHours: 24 });
  });

  describe('eviction', () => {
    it('destroys WARM instances older than the max age', async () => {
      mockListing([
        instance('i-old', 'WARM', 11 * HOUR, { spotInstanceRequestId: 'sir-old' }),
        instance('i-young', 'WARM', 9 * HOUR),
      ]);

      await reconcile(2, { maxAgeHours: 10 });

      expect(standby.destroy).toHaveBeenCalledWith([{ instanceId: 'i-old', spotInstanceRequestId: 'sir-old' }]);
      expect(standby.launch).toHaveBeenCalledWith(expect.objectContaining({ numberOfInstances: 1 }));
    });

    it('destroys WARM instances whose AMI or launch template version drifted', async () => {
      mockListing([
        instance('i-ami', 'WARM', HOUR, { imageId: 'ami-old' }),
        instance('i-lt', 'WARM', HOUR, { launchTemplateVersion: '2' }),
        instance('i-current', 'WARM', HOUR),
      ]);

      await reconcile(3);

      expect(destroyedIds()).toEqual(['i-ami', 'i-lt']);
      expect(standby.launch).toHaveBeenCalledWith(expect.objectContaining({ numberOfInstances: 2 }));
    });

    it('skips drift checks for values that cannot be determined', async () => {
      standby.currentImage.mockResolvedValue({ launchTemplateVersion: '3' });
      mockListing([instance('i-ami', 'WARM', HOUR, { imageId: 'ami-other' })]);

      await reconcile(1);

      expect(standby.destroy).not.toHaveBeenCalled();
    });

    it('destroys the oldest WARM instances above the target', async () => {
      mockListing([
        instance('i-2h', 'WARM', 2 * HOUR),
        instance('i-3h', 'WARM', 3 * HOUR),
        instance('i-1h', 'WARM', HOUR),
      ]);

      await reconcile(1);

      expect(destroyedIds()).toEqual(['i-3h', 'i-2h']);
      expect(standby.launch).not.toHaveBeenCalled();
    });

    it('destroys PRIMING instances that exceeded the boot time', async () => {
      mockListing([instance('i-stuck', 'PRIMING', 11 * MINUTE), instance('i-booting', 'PRIMING', 9 * MINUTE)]);

      await reconcile(2, { bootTimeoutMinutes: 10 });

      expect(destroyedIds()).toEqual(['i-stuck']);
      expect(standby.launch).toHaveBeenCalledWith(expect.objectContaining({ numberOfInstances: 1 }));
    });

    it('destroys all GARBAGE instances', async () => {
      mockListing([instance('i-g1', 'GARBAGE', MINUTE), instance('i-g2', 'GARBAGE', 300 * HOUR)]);

      await reconcile(0);

      expect(destroyedIds()).toEqual(['i-g1', 'i-g2']);
    });

    it('never touches ACTIVE instances', async () => {
      mockListing([
        instance('i-active-old', 'ACTIVE', 300 * HOUR, { imageId: 'ami-old', launchTemplateVersion: '1' }),
        instance('i-active', 'ACTIVE', MINUTE),
      ]);

      await reconcile(0);

      expect(standby.destroy).not.toHaveBeenCalled();
      expect(standby.launch).not.toHaveBeenCalled();
    });

    it('does not count ACTIVE instances toward the target', async () => {
      mockListing([instance('i-active', 'ACTIVE', MINUTE)]);

      await reconcile(1);

      expect(standby.launch).toHaveBeenCalledWith(expect.objectContaining({ numberOfInstances: 1 }));
    });

    it('drains every WARM instance at size 0 but keeps young PRIMING instances', async () => {
      mockListing([
        instance('i-w1', 'WARM', HOUR),
        instance('i-w2', 'WARM', 2 * HOUR),
        instance('i-p1', 'PRIMING', MINUTE),
      ]);

      await reconcile(0);

      expect(destroyedIds()).toEqual(['i-w2', 'i-w1']);
      expect(standby.launch).not.toHaveBeenCalled();
    });

    it('cancels orphaned spot requests', async () => {
      standby.listOrphanedSpotRequests.mockResolvedValue([
        { spotInstanceRequestId: 'sir-1', state: 'open' },
        { spotInstanceRequestId: 'sir-2', state: 'disabled', instanceId: 'i-gone' },
      ]);

      await reconcile(0);

      expect(standby.listOrphanedSpotRequests).toHaveBeenCalledWith(POOL_INPUT);
      expect(standby.cancelSpotRequests).toHaveBeenCalledWith(['sir-1', 'sir-2']);
    });

    it('does not cancel spot requests when none are orphaned', async () => {
      await reconcile(0);

      expect(standby.cancelSpotRequests).not.toHaveBeenCalled();
    });
  });

  describe('refill', () => {
    it('launches the deficit counting WARM and PRIMING instances', async () => {
      mockListing([
        instance('i-w1', 'WARM', HOUR),
        instance('i-p1', 'PRIMING', MINUTE),
        instance('i-a1', 'ACTIVE', MINUTE),
      ]);

      await reconcile(5);

      expect(standby.destroy).not.toHaveBeenCalled();
      expect(standby.launch).toHaveBeenCalledWith(expect.objectContaining({ numberOfInstances: 3 }));
    });

    it('does not launch when PRIMING instances already cover the target', async () => {
      mockListing([instance('i-p1', 'PRIMING', MINUTE), instance('i-p2', 'PRIMING', MINUTE)]);

      await reconcile(1);

      expect(standby.destroy).not.toHaveBeenCalled();
      expect(standby.launch).not.toHaveBeenCalled();
    });

    it('evicts before refilling', async () => {
      mockListing([instance('i-drift', 'WARM', HOUR, { imageId: 'ami-old' })]);

      await reconcile(1);

      expect(standby.destroy.mock.invocationCallOrder[0]).toBeLessThan(standby.launch.mock.invocationCallOrder[0]);
      expect(standby.launch).toHaveBeenCalledWith(expect.objectContaining({ numberOfInstances: 1 }));
    });

    it('still counts instances whose eviction failed', async () => {
      mockListing([instance('i-drift', 'WARM', HOUR, { imageId: 'ami-old' })]);
      standby.destroy.mockResolvedValue({ succeeded: [], failed: ['i-drift'] });

      await reconcile(1);

      expect(standby.launch).not.toHaveBeenCalled();
    });
  });

  describe('result', () => {
    it('reports pool counts and successful evictions by reason', async () => {
      mockListing([
        instance('i-old', 'WARM', 11 * HOUR),
        instance('i-drift', 'WARM', HOUR, { imageId: 'ami-old' }),
        instance('i-w1', 'WARM', HOUR),
        instance('i-w2', 'WARM', 2 * HOUR),
        instance('i-stuck', 'PRIMING', 6 * MINUTE),
        instance('i-p1', 'PRIMING', MINUTE),
        instance('i-g1', 'GARBAGE', MINUTE),
        instance('i-g2', 'GARBAGE', MINUTE),
        instance('i-a1', 'ACTIVE', MINUTE),
      ]);
      standby.listOrphanedSpotRequests.mockResolvedValue([{ spotInstanceRequestId: 'sir-1' }]);
      standby.destroy.mockImplementation(async (instances) => ({
        succeeded: instances.map((i) => i.instanceId).filter((id) => id !== 'i-g2'),
        failed: ['i-g2'],
      }));

      const result = await reconcile(1, { maxAgeHours: 10 });

      expect(result).toEqual({
        ready: 1,
        preparing: 1,
        launched: 0,
        evictions: {
          'max-age': 1,
          drift: 1,
          'stuck-priming': 1,
          garbage: 1,
          'over-target': 1,
          'orphaned-spot-request': 1,
        },
        errors: [],
      });
      expect(Object.keys(result.evictions)).toEqual([
        'max-age',
        'drift',
        'stuck-priming',
        'garbage',
        'over-target',
        'orphaned-spot-request',
      ]);
    });

    it('counts launched instances as preparing', async () => {
      mockListing([instance('i-p1', 'PRIMING', MINUTE)]);
      standby.launch.mockResolvedValue({ instances: ['i-new'], retryableErrorCount: 1, nonRetryableErrorCount: 0 });

      await expect(reconcile(3)).resolves.toEqual({
        ready: 0,
        preparing: 2,
        launched: 1,
        evictions: {},
        errors: [],
      });
    });
  });
});
