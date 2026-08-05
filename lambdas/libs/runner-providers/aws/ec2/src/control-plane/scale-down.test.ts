import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createEc2ScaleDownProvider } from './scale-down';
import { listEC2Runners, tag, terminateRunner, untag } from './runners';
import type { RunnerList } from './runners.d';

vi.mock('./runners', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./runners')>();
  return {
    ...actual,
    listEC2Runners: vi.fn(),
    tag: vi.fn(),
    terminateRunner: vi.fn(),
    untag: vi.fn(),
  };
});

const mockListRunners = vi.mocked(listEC2Runners);
const mockTagRunner = vi.mocked(tag);
const mockTerminateRunner = vi.mocked(terminateRunner);
const mockUntagRunner = vi.mocked(untag);

describe('Scale down runners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const endpoints = ['https://api.github.com', 'https://github.enterprise.something', 'https://companyname.ghe.com'];

  describe.each(endpoints)('for %s', () => {
    type RunnerType = 'Repo' | 'Org';
    const runnerTypes: RunnerType[] = ['Org', 'Repo'];

    describe.each(runnerTypes)('For %s runners.', (type) => {
      const runner: RunnerList = {
        instanceId: `i-runner-${type.toLowerCase()}`,
        launchTime: new Date('2026-08-05T10:00:00.000Z'),
        owner: type === 'Repo' ? 'Codertocat/hello-world' : 'Codertocat',
        type,
        repo: 'hello-world',
        org: 'Codertocat',
        orphan: true,
        runnerId: '1234567890',
        bypassRemoval: true,
      };

      it('Should not call terminate when no runners online.', async () => {
        mockListRunners.mockResolvedValueOnce([]).mockResolvedValueOnce([runner]);
        mockTagRunner.mockResolvedValue();
        mockUntagRunner.mockResolvedValue();
        const provider = createEc2ScaleDownProvider();

        await expect(provider.list('unit-test-environment')).resolves.toEqual([]);
        await expect(provider.list('unit-test-environment', true)).resolves.toEqual([
          {
            id: runner.instanceId,
            launchTime: runner.launchTime,
            owner: runner.owner,
            type: runner.type,
            repo: runner.repo,
            org: runner.org,
            orphan: runner.orphan,
            githubRunnerId: runner.runnerId,
            bypassRemoval: runner.bypassRemoval,
          },
        ]);
        expect(mockListRunners).toHaveBeenNthCalledWith(1, {
          environment: 'unit-test-environment',
          orphan: undefined,
        });
        expect(mockListRunners).toHaveBeenNthCalledWith(2, { environment: 'unit-test-environment', orphan: true });
        expect(mockTerminateRunner).not.toHaveBeenCalled();

        await provider.markOrphan(runner.instanceId);
        await provider.unmarkOrphan(runner.instanceId);

        expect(mockTagRunner).toHaveBeenCalledWith(runner.instanceId, [{ Key: 'ghr:orphan', Value: 'true' }]);
        expect(mockUntagRunner).toHaveBeenCalledWith(runner.instanceId, [{ Key: 'ghr:orphan', Value: 'true' }]);
      });

      it(`Should respect booting runner.`, async () => {
        const scaleDownRunner = {
          id: runner.instanceId,
          launchTime: new Date(),
          owner: runner.owner as string,
          type: runner.type as string,
        };
        process.env.RUNNER_BOOT_TIME_IN_MINUTES = '5';
        const provider = createEc2ScaleDownProvider();

        expect(provider.bootTimeExceeded(scaleDownRunner)).toBe(false);
        expect(mockTerminateRunner).not.toHaveBeenCalled();
        mockTerminateRunner.mockResolvedValue();
        await provider.terminate(runner.instanceId);

        expect(mockTerminateRunner).toHaveBeenCalledWith(runner.instanceId);
      });
    });
  });
});
