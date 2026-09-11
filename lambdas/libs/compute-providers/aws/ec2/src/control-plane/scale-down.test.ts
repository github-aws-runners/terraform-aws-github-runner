import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunnerInfo, RunnerType } from '../../../../core';
import { IDLE_DETECTED_TAG, createEc2ScaleDownCapability } from './scale-down';
import type { Ec2RunnerResourceOperations } from '../runners';

const warmPoolMocks = vi.hoisted(() => ({
  getWarmPoolConfig: vi.fn(),
  getPoolStrategy: vi.fn(),
  resolveCurrentAmiId: vi.fn(),
  listWarmInstancesByOwner: vi.fn(),
  countWarmInstancesByOwner: vi.fn(),
  addToWarmPool: vi.fn(),
  removeFromWarmPool: vi.fn(),
  emitWarmPoolMetric: vi.fn(),
}));
vi.mock('./warm-pool', () => warmPoolMocks);

const mockListRunners = vi.fn<Ec2RunnerResourceOperations['list']>();
const mockCreateRunner = vi.fn<Ec2RunnerResourceOperations['create']>();
const mockTagRunner = vi.fn<Ec2RunnerResourceOperations['tag']>();
const mockTerminateRunner = vi.fn<Ec2RunnerResourceOperations['terminate']>();
const mockStopRunner = vi.fn<Ec2RunnerResourceOperations['stop']>();
const mockStartRunner = vi.fn<Ec2RunnerResourceOperations['start']>();
const mockUntagRunner = vi.fn<Ec2RunnerResourceOperations['untag']>();
const mockListSpotRequests = vi.fn<Ec2RunnerResourceOperations['listActivePersistentSpotRequests']>();
const mockCancelSpotRequests = vi.fn<Ec2RunnerResourceOperations['cancelSpotRequests']>();
const ec2Operations: Ec2RunnerResourceOperations = {
  list: mockListRunners,
  create: mockCreateRunner,
  terminate: mockTerminateRunner,
  stop: mockStopRunner,
  start: mockStartRunner,
  tag: mockTagRunner,
  untag: mockUntagRunner,
  listActivePersistentSpotRequests: mockListSpotRequests,
  cancelSpotRequests: mockCancelSpotRequests,
};
const capability = createEc2ScaleDownCapability(ec2Operations);

describe('Scale down runners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const endpoints = ['https://api.github.com', 'https://github.enterprise.something', 'https://companyname.ghe.com'];

  describe.each(endpoints)('for %s', () => {
    const runnerTypes: RunnerType[] = ['Org', 'Repo'];

    describe.each(runnerTypes)('For %s runners.', (type) => {
      const runner: RunnerInfo = {
        id: `i-runner-${type.toLowerCase()}`,
        launchTime: new Date('2026-08-05T10:00:00.000Z'),
        owner: type === 'Repo' ? 'Codertocat/hello-world' : 'Codertocat',
        type,
        repo: 'hello-world',
        org: 'Codertocat',
        orphan: true,
        githubRunnerId: '1234567890',
        bypassRemoval: true,
      };

      it('Should not call terminate when no runners online.', async () => {
        mockListRunners.mockResolvedValueOnce([]).mockResolvedValueOnce([runner]);
        mockTagRunner.mockResolvedValue();
        mockUntagRunner.mockResolvedValue();
        await expect(capability.list('unit-test-environment')).resolves.toEqual([]);
        await expect(capability.list('unit-test-environment', true)).resolves.toEqual([runner]);
        expect(mockListRunners).toHaveBeenNthCalledWith(1, {
          environment: 'unit-test-environment',
          orphan: undefined,
        });
        expect(mockListRunners).toHaveBeenNthCalledWith(2, { environment: 'unit-test-environment', orphan: true });
        expect(mockTerminateRunner).not.toHaveBeenCalled();

        await capability.markOrphan(runner.id);
        await capability.unmarkOrphan(runner.id);

        expect(mockTagRunner).toHaveBeenCalledWith(runner.id, [{ Key: 'ghr:orphan', Value: 'true' }]);
        expect(mockUntagRunner).toHaveBeenCalledWith(runner.id, [{ Key: 'ghr:orphan', Value: 'true' }]);
      });

      it('Should persist and clear the idle-detection marker as an instance tag.', async () => {
        mockTagRunner.mockResolvedValue();
        mockUntagRunner.mockResolvedValue();
        const detectedAt = '2026-08-05T10:05:00.000Z';

        await capability.markIdle(runner.id, detectedAt);
        await capability.unmarkIdle(runner.id);

        expect(mockTagRunner).toHaveBeenCalledWith(runner.id, [{ Key: IDLE_DETECTED_TAG, Value: detectedAt }]);
        expect(mockUntagRunner).toHaveBeenCalledWith(runner.id, [{ Key: IDLE_DETECTED_TAG }]);
        expect(mockTerminateRunner).not.toHaveBeenCalled();
      });

      it(`Should respect booting runner.`, async () => {
        const scaleDownRunner: RunnerInfo = {
          ...runner,
          launchTime: new Date(),
        };
        process.env.RUNNER_BOOT_TIME_IN_MINUTES = '5';

        expect(capability.bootTimeExceeded(scaleDownRunner)).toBe(false);
        expect(mockTerminateRunner).not.toHaveBeenCalled();
        mockTerminateRunner.mockResolvedValue();
        await capability.terminate(runner.id);

        expect(mockTerminateRunner).toHaveBeenCalledWith(runner.id);
      });
    });
  });
});

describe('Reconcile stale persistent spot requests', () => {
  const managedRunner: RunnerInfo = { id: 'i-managed', owner: 'Codertocat', type: 'Org' };

  beforeEach(() => {
    vi.clearAllMocks();
    warmPoolMocks.getWarmPoolConfig.mockReturnValue({
      enabled: true,
      maxWarmInstances: 3,
      maxWarmAgeHours: 168,
      warmPoolReadyDelaySeconds: 30,
    });
    warmPoolMocks.getPoolStrategy.mockReturnValue('warm');
    warmPoolMocks.resolveCurrentAmiId.mockResolvedValue(undefined);
    // No warm instances to evict on age/count/AMI — isolates these tests to the reconcile step.
    warmPoolMocks.listWarmInstancesByOwner.mockResolvedValue([]);
  });

  it('terminates a stray instance whose persistent spot request backs no managed runner', async () => {
    // Snapshot at the top of the run and the pre-terminate re-check both only see the managed runner.
    mockListRunners.mockResolvedValue([managedRunner]);
    mockListSpotRequests.mockResolvedValue([{ spotInstanceRequestId: 'sir-1', instanceId: 'i-stray', state: 'active' }]);
    mockCancelSpotRequests.mockResolvedValue();
    mockTerminateRunner.mockResolvedValue();

    await capability.maintain('unit-test-environment');

    expect(mockCancelSpotRequests).toHaveBeenCalledWith(['sir-1']);
    expect(mockTerminateRunner).toHaveBeenCalledWith('i-stray');
  });

  it('reprieves an instance that started running after the initial snapshot, without cancelling its spot request', async () => {
    mockListSpotRequests.mockResolvedValue([
      { spotInstanceRequestId: 'sir-warm', instanceId: 'i-warm-started', state: 'active' },
    ]);
    // First list() call (top-level snapshot) misses the instance; the re-check right before
    // acting picks it up, mirroring a warm-start that completed mid-reconcile.
    mockListRunners.mockResolvedValueOnce([managedRunner]);
    mockListRunners.mockResolvedValueOnce([managedRunner, { ...managedRunner, id: 'i-warm-started' }]);

    await capability.maintain('unit-test-environment');

    expect(mockCancelSpotRequests).not.toHaveBeenCalled();
    expect(mockTerminateRunner).not.toHaveBeenCalled();
  });
});
