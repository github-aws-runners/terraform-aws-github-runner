import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunnerInfo, RunnerType } from '../../../../core';
import { type Ec2ScaleDownStandbyOperations, IDLE_DETECTED_TAG, createEc2ScaleDownCapability } from './scale-down';
import type { Ec2RunnerResourceOperations } from '../runners';

const mockListRunners = vi.fn<Ec2RunnerResourceOperations['list']>();
const mockCreateRunner = vi.fn<Ec2RunnerResourceOperations['create']>();
const mockTagRunner = vi.fn<Ec2RunnerResourceOperations['tag']>();
const mockTerminateRunner = vi.fn<Ec2RunnerResourceOperations['terminate']>();
const mockUntagRunner = vi.fn<Ec2RunnerResourceOperations['untag']>();
const ec2Operations: Ec2RunnerResourceOperations = {
  list: mockListRunners,
  create: mockCreateRunner,
  terminate: mockTerminateRunner,
  tag: mockTagRunner,
  untag: mockUntagRunner,
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

describe('Standby sweep', () => {
  const mockListStoppedWarmInstances = vi.fn<Ec2ScaleDownStandbyOperations['listStoppedWarmInstances']>();
  const mockListScaleDownInstances = vi.fn<Ec2ScaleDownStandbyOperations['listScaleDownInstances']>();
  const mockDestroyInstance = vi.fn<Ec2ScaleDownStandbyOperations['destroyInstance']>();
  const sweepCapability = createEc2ScaleDownCapability(ec2Operations, {
    listStoppedWarmInstances: mockListStoppedWarmInstances,
    listScaleDownInstances: mockListScaleDownInstances,
    destroyInstance: mockDestroyInstance,
  });
  const PAST = '2026-09-29T12:00:00.000Z';
  const FUTURE = '2026-10-01T12:00:00.000Z';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: new Date('2026-09-30T12:00:00.000Z') });
    mockDestroyInstance.mockResolvedValue();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is not offered without standby operations', () => {
    expect(capability.sweepStandby).toBeUndefined();
  });

  it('destroys expired and settled activated stopped warm instances and keeps the rest', async () => {
    mockListStoppedWarmInstances.mockResolvedValue([
      { instanceId: 'i-expired', spotInstanceRequestId: 'sir-expired', expiresAt: PAST, activated: false },
      { instanceId: 'i-activated', expiresAt: FUTURE, activated: true, activatedAt: '2026-09-30T11:45:00.000Z' },
      { instanceId: 'i-activating', expiresAt: FUTURE, activated: true, activatedAt: '2026-09-30T11:59:59.000Z' },
      { instanceId: 'i-warm', spotInstanceRequestId: 'sir-warm', expiresAt: FUTURE, activated: false },
      { instanceId: 'i-no-expiry', activated: false },
      { instanceId: 'i-bad-expiry', expiresAt: 'not-a-date', activated: false },
    ]);

    await sweepCapability.sweepStandby!('unit-test-environment');

    expect(mockListStoppedWarmInstances).toHaveBeenCalledWith('unit-test-environment');
    expect(mockDestroyInstance).toHaveBeenCalledTimes(2);
    expect(mockDestroyInstance).toHaveBeenCalledWith({ instanceId: 'i-expired', spotInstanceRequestId: 'sir-expired' });
    expect(mockDestroyInstance).toHaveBeenCalledWith({ instanceId: 'i-activated', spotInstanceRequestId: undefined });
    expect(mockTerminateRunner).not.toHaveBeenCalled();
  });

  it('decides activated instances by activation age only', async () => {
    mockListStoppedWarmInstances.mockResolvedValue([
      { instanceId: 'i-expired-activating', expiresAt: PAST, activated: true, activatedAt: '2026-09-30T11:59:59.000Z' },
      { instanceId: 'i-boundary', expiresAt: FUTURE, activated: true, activatedAt: '2026-09-30T11:50:00.000Z' },
      { instanceId: 'i-missing-time', expiresAt: FUTURE, activated: true },
      { instanceId: 'i-bad-time', expiresAt: FUTURE, activated: true, activatedAt: 'not-a-date' },
    ]);

    await sweepCapability.sweepStandby!('unit-test-environment');

    const destroyed = mockDestroyInstance.mock.calls.map(([input]) => input.instanceId);
    expect(destroyed.sort()).toEqual(['i-bad-time', 'i-boundary', 'i-missing-time']);
  });

  it('reuses the stopped warm instances of the runner listing once', async () => {
    const runner = { id: 'i-runner', launchTime: new Date(), owner: 'o', type: 'Org' } as RunnerInfo;
    mockListScaleDownInstances.mockResolvedValue({
      runners: [runner],
      stoppedWarm: [{ instanceId: 'i-expired', expiresAt: PAST, activated: false }],
    });
    mockListStoppedWarmInstances.mockResolvedValue([]);

    await expect(sweepCapability.list('unit-test-environment')).resolves.toEqual([runner]);
    await sweepCapability.sweepStandby!('unit-test-environment');

    expect(mockListRunners).not.toHaveBeenCalled();
    expect(mockListStoppedWarmInstances).not.toHaveBeenCalled();
    expect(mockDestroyInstance).toHaveBeenCalledWith({ instanceId: 'i-expired', spotInstanceRequestId: undefined });

    await sweepCapability.sweepStandby!('unit-test-environment');

    expect(mockListStoppedWarmInstances).toHaveBeenCalledWith('unit-test-environment');
    expect(mockDestroyInstance).toHaveBeenCalledTimes(1);
  });

  it('lists orphans without the combined listing', async () => {
    mockListRunners.mockResolvedValue([]);

    await sweepCapability.list('unit-test-environment', true);

    expect(mockListRunners).toHaveBeenCalledWith({ environment: 'unit-test-environment', orphan: true });
    expect(mockListScaleDownInstances).not.toHaveBeenCalled();
  });

  it('keeps destroying the remaining instances when one destroy fails', async () => {
    mockListStoppedWarmInstances.mockResolvedValue([
      { instanceId: 'i-fail', expiresAt: PAST, activated: false },
      { instanceId: 'i-ok', expiresAt: PAST, activated: false },
    ]);
    mockDestroyInstance.mockRejectedValueOnce(new Error('UnauthorizedOperation'));

    await expect(sweepCapability.sweepStandby!('unit-test-environment')).resolves.toBeUndefined();

    expect(mockDestroyInstance).toHaveBeenCalledWith({ instanceId: 'i-fail', spotInstanceRequestId: undefined });
    expect(mockDestroyInstance).toHaveBeenCalledWith({ instanceId: 'i-ok', spotInstanceRequestId: undefined });
  });
});
