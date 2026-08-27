import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunnerInfo, RunnerType } from '../../../../core';
import { createEc2ScaleDownCapability } from './scale-down';
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
