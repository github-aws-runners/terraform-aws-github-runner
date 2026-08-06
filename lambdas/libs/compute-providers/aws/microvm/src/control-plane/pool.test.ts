import type { Octokit } from '@octokit/rest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateGitHubRunnerConfig, CreateStartRunnerConfig } from '../../../../core';
import { listMicrovmRunners, microvmBootTimeExceeded } from './microvms';
import type { MicrovmRunnerInfo } from './microvms';
import { calculateMicrovmPoolSize, createMicrovmPoolProvider } from './pool';
import { createMicrovmRunners } from './runner-config';

vi.mock('./microvms', () => ({
  listMicrovmRunners: vi.fn(),
  microvmBootTimeExceeded: vi.fn(),
}));
vi.mock('./runner-config', () => ({ createMicrovmRunners: vi.fn() }));

const createStartRunnerConfig = vi.fn<CreateStartRunnerConfig>();
const githubClient = {} as Octokit;
function runner(id: string, state: MicrovmRunnerInfo['state']): MicrovmRunnerInfo {
  return { id, state, owner: 'Codertocat', type: 'Org' };
}

function githubRunnerConfig(): CreateGitHubRunnerConfig {
  return {
    ephemeral: true,
    enableJitConfig: true,
    runnerLabels: 'self-hosted,microvm',
    runnerGroup: 'Default',
    runnerNamePrefix: '',
    runnerOwner: 'Codertocat',
    runnerType: 'Org',
    disableAutoUpdate: true,
    ssmTokenPath: '/runner/token',
    ssmConfigPath: '/runner/config',
    ssmParameterStoreTags: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listMicrovmRunners).mockResolvedValue([]);
  vi.mocked(microvmBootTimeExceeded).mockReturnValue(false);
  vi.mocked(createMicrovmRunners).mockResolvedValue({
    instances: ['mvm-1'],
    retryableErrorCount: 0,
    nonRetryableErrorCount: 0,
  });
});

describe('calculateMicrovmPoolSize', () => {
  it('counts online idle running runners', () => {
    expect(
      calculateMicrovmPoolSize(
        [runner('mvm-idle', 'RUNNING')],
        new Map([['mvm-idle', { busy: false, status: 'online' }]]),
      ),
    ).toBe(1);
  });

  it('optionally counts online busy runners', () => {
    const runners = [runner('mvm-busy', 'RUNNING')];
    const statuses = new Map([['mvm-busy', { busy: true, status: 'online' }]]);

    expect(calculateMicrovmPoolSize(runners, statuses)).toBe(0);
    expect(calculateMicrovmPoolSize(runners, statuses, true)).toBe(1);
  });

  it('counts pending runners only during their boot window', () => {
    const runners = [runner('mvm-pending', 'PENDING')];
    vi.mocked(microvmBootTimeExceeded).mockReturnValueOnce(false).mockReturnValueOnce(true);

    expect(calculateMicrovmPoolSize(runners, new Map())).toBe(1);
    expect(calculateMicrovmPoolSize(runners, new Map())).toBe(0);
  });

  it('does not count suspended or offline runners', () => {
    expect(
      calculateMicrovmPoolSize(
        [runner('mvm-suspended', 'SUSPENDED'), runner('mvm-offline', 'RUNNING')],
        new Map([['mvm-offline', { busy: false, status: 'offline' }]]),
      ),
    ).toBe(0);
  });
});

describe('createMicrovmPoolProvider', () => {
  it('lists managed MicroVMs and returns successfully created IDs', async () => {
    const provider = createMicrovmPoolProvider(createStartRunnerConfig);
    const input = {
      environment: 'unit-test',
      runnerOwner: 'Codertocat',
      runnerType: 'Org' as const,
    };

    await expect(provider.listRunners(input)).resolves.toEqual([]);
    expect(listMicrovmRunners).toHaveBeenCalledWith(input);

    await expect(
      provider.createRunners({
        githubRunnerConfig: githubRunnerConfig(),
        numberOfRunners: 1,
        githubInstallationClient: githubClient,
      }),
    ).resolves.toEqual(['mvm-1']);
    expect(createMicrovmRunners).toHaveBeenCalledWith(
      expect.any(Object),
      1,
      githubClient,
      createStartRunnerConfig,
      'pool-lambda',
    );
  });
});
