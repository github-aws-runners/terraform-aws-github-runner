import type { Octokit } from '@octokit/rest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunnerGroupCacheStore } from '@aws-github-runner/storage-providers';

import { getStoredInstallationId } from '../github/auth';
import { createStartRunnerConfig, getInstallationId, getRunnerGroupId } from './github-runner';
import type { ActionRequestMessage, CreateGitHubRunnerConfig } from './types';

vi.mock('../github/auth', () => ({ getStoredInstallationId: vi.fn().mockResolvedValue(999) }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const payload: ActionRequestMessage = {
  id: 1,
  eventType: 'workflow_job',
  repositoryOwner: 'org-a',
  repositoryName: 'repo',
  repoOwnerType: 'Organization',
  installationId: 10,
};

const config: CreateGitHubRunnerConfig = {
  ephemeral: true,
  enableJitConfig: true,
  runnerOwner: 'org-a',
  runnerType: 'Org',
  runnerGroup: 'Default',
  runnerLabels: 'self-hosted,linux',
  runnerNamePrefix: '',
  disableAutoUpdate: false,
};

describe('multi-org registration', () => {
  it.each([undefined, 'false'])('preserves stored installation IDs with flag %s', async (flag) => {
    vi.stubEnv('ENABLE_MULTI_ORG_RUNNERS', flag);
    expect(await getInstallationId({} as Octokit, true, payload, 0)).toBe(999);
  });

  it('uses each webhook installation for the primary app, ignoring the global installation', async () => {
    vi.stubEnv('ENABLE_MULTI_ORG_RUNNERS', 'true');
    expect(await getInstallationId({} as Octokit, true, payload, 0)).toBe(10);
    expect(
      await getInstallationId({} as Octokit, true, { ...payload, installationId: 20, repositoryOwner: 'org-b' }, 0),
    ).toBe(20);
    expect(getStoredInstallationId).not.toHaveBeenCalled();
  });

  it.each([0, 1])('resolves missing or additional-app installations for the target org (app %s)', async (appIndex) => {
    vi.stubEnv('ENABLE_MULTI_ORG_RUNNERS', 'true');
    const getOrgInstallation = vi.fn().mockResolvedValue({ data: { id: 30 } });
    const client = { apps: { getOrgInstallation } } as unknown as Octokit;
    expect(
      await getInstallationId(client, true, { ...payload, installationId: appIndex === 0 ? 0 : 10 }, appIndex),
    ).toBe(30);
    expect(getOrgInstallation).toHaveBeenCalledWith({ org: 'org-a' });
    expect(getStoredInstallationId).not.toHaveBeenCalled();
  });

  it('generates JIT configs with separate group IDs for identically named groups in two orgs', async () => {
    vi.stubEnv('ENABLE_MULTI_ORG_RUNNERS', 'true');
    // An existing unscoped entry must not be reused in multi-org mode.
    const groups = new Map<string, number>([['Default', 999]]);
    const runnerGroupCacheStore: RunnerGroupCacheStore = {
      get: vi.fn(async (key) => groups.get(key)),
      create: vi.fn(async ({ runnerGroupName, runnerGroupId }) => {
        groups.set(runnerGroupName, runnerGroupId);
      }),
    };
    const paginate = vi
      .fn()
      .mockImplementation(async (_route, { org }) => [{ name: 'Default', id: org === 'org-a' ? 11 : 22 }]);
    const generateRunnerJitconfigForOrg = vi
      .fn()
      .mockResolvedValue({ data: { runner: { id: 1 }, encoded_jit_config: 'jit' }, headers: {} });
    const client = { paginate, actions: { generateRunnerJitconfigForOrg } } as unknown as Octokit;
    const runnerConfigStore = { create: vi.fn().mockResolvedValue(undefined) };
    for (const org of ['org-a', 'org-b', 'org-a']) {
      expect(
        await createStartRunnerConfig({ ...config, runnerOwner: org }, [`runner-${org}`], client, {
          runnerConfigStore,
          runnerGroupCacheStore,
        }),
      ).toEqual([]);
    }
    expect(paginate).toHaveBeenCalledTimes(2);
    expect(generateRunnerJitconfigForOrg).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ org: 'org-a', runner_group_id: 11 }),
    );
    expect(generateRunnerJitconfigForOrg).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ org: 'org-b', runner_group_id: 22 }),
    );
    expect(generateRunnerJitconfigForOrg).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ org: 'org-a', runner_group_id: 11 }),
    );
    expect(runnerGroupCacheStore.get).not.toHaveBeenCalledWith('Default');
  });

  it('preserves the existing group cache key when disabled', async () => {
    vi.stubEnv('ENABLE_MULTI_ORG_RUNNERS', 'false');
    const cache = { get: vi.fn().mockResolvedValue(7), create: vi.fn() };
    expect(await getRunnerGroupId(config, {} as Octokit, cache)).toBe(7);
    expect(cache.get).toHaveBeenCalledWith('Default');
  });
});
