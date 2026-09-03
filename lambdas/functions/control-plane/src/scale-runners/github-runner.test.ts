import { putParameter } from '@aws-github-runner/aws-ssm-util';
import type { Octokit } from '@octokit/rest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStartRunnerConfig } from './github-runner';
import type { CreateGitHubRunnerConfig } from './types';

vi.mock('@aws-github-runner/aws-ssm-util', () => ({
  getParameter: vi.fn(),
  putParameter: vi.fn(),
}));

const githubRunnerConfig: CreateGitHubRunnerConfig = {
  disableAutoUpdate: true,
  enableJitConfig: true,
  ephemeral: true,
  runnerGroup: 'Default',
  runnerLabels: 'self-hosted,linux',
  runnerNamePrefix: 'runner-',
  runnerOwner: 'octocat/runner',
  runnerType: 'Repo',
  ssmConfigPath: '/github-action-runners/test/config',
  ssmParameterStoreTags: [],
  ssmTokenPath: '/github-action-runners/test/tokens',
};

const generateRunnerJitconfigForRepo = vi.fn();
const githubClient = {
  actions: { generateRunnerJitconfigForRepo },
} as unknown as Octokit;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(putParameter).mockResolvedValue();
  generateRunnerJitconfigForRepo.mockResolvedValue({
    data: {
      encoded_jit_config: 'encoded-jit-config',
      runner: { id: 42 },
    },
    headers: {},
  });
});

describe('createStartRunnerConfig', () => {
  it('persists JIT configuration before notifying the provider', async () => {
    const onJitConfigCreated = vi.fn(async () => {
      expect(putParameter).toHaveBeenCalledWith(
        '/github-action-runners/test/tokens/microvm-1',
        'encoded-jit-config',
        true,
        { tags: [] },
      );
    });

    await expect(
      createStartRunnerConfig(githubRunnerConfig, ['microvm-1'], githubClient, { onJitConfigCreated }),
    ).resolves.toEqual([]);
    expect(onJitConfigCreated).toHaveBeenCalledWith('microvm-1', {
      githubRunnerId: '42',
      runnerLabels: ['self-hosted', 'linux'],
    });
  });

  it('reports provider post-write fencing failures while leaving cleanup to the provider', async () => {
    const onJitConfigCreated = vi.fn().mockRejectedValue(new Error('cleanup already requested'));

    await expect(
      createStartRunnerConfig(githubRunnerConfig, ['microvm-1'], githubClient, { onJitConfigCreated }),
    ).resolves.toEqual(['microvm-1']);
    expect(putParameter).toHaveBeenCalledOnce();
  });
});
