import { Octokit } from '@octokit/rest';
import { ActionRequestMessage } from '../scale-runners/scale-up';
import { getOctokit } from './octokit';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createGithubAppAuth, createGithubInstallationAuth } from '../github/auth';

const mockOctokit = {
  apps: {
    getOrgInstallation: vi.fn(),
    getRepoInstallation: vi.fn(),
  },
};

vi.mock('../github/auth', async () => ({
  createGithubInstallationAuth: vi.fn().mockImplementation(async (installationId: number) => {
    return { token: 'token', type: 'installation', installationId: installationId };
  }),
  createOctokitClient: vi.fn().mockImplementation(() => new Octokit()),
  createGithubAppAuth: vi.fn().mockResolvedValue({ token: 'token' }),
}));

vi.mock('@octokit/rest', async () => ({
  Octokit: vi.fn().mockImplementation(function () {
    return mockOctokit;
  }),
}));

// We've already mocked '../github/auth' above

describe('Test getOctokit', () => {
  const data: Array<{
    description: string;
    input: { orgLevelRunner: boolean; installationId: number };
    output: { callReposInstallation: boolean; callOrgInstallation: boolean };
  }> = [
    {
      description: 'Should look-up org installation if installationId is 0.',
      input: { orgLevelRunner: false, installationId: 0 },
      output: { callReposInstallation: true, callOrgInstallation: false },
    },
    {
      description: 'Should look-up org installation if installationId is 0.',
      input: { orgLevelRunner: true, installationId: 0 },
      output: { callReposInstallation: false, callOrgInstallation: true },
    },
    {
      description: 'Should not look-up org installation if provided in payload.',
      input: { orgLevelRunner: true, installationId: 1 },
      output: { callReposInstallation: false, callOrgInstallation: false },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(data)(`$description`, async ({ input, output }: (typeof data)[number]) => {
    const payload = {
      eventType: 'workflow_job',
      id: 0,
      installationId: input.installationId,
      repositoryOwner: 'owner',
      repositoryName: 'repo',
    } as ActionRequestMessage;

    if (input.orgLevelRunner) {
      mockOctokit.apps.getOrgInstallation.mockResolvedValue({ data: { id: 1 } });
      mockOctokit.apps.getRepoInstallation.mockRejectedValue(new Error('Error'));
    } else {
      mockOctokit.apps.getRepoInstallation.mockResolvedValue({ data: { id: 2 } });
      mockOctokit.apps.getOrgInstallation.mockRejectedValue(new Error('Error'));
    }

    await expect(getOctokit('', input.orgLevelRunner, payload)).resolves.toBeDefined();

    if (output.callOrgInstallation) {
      expect(mockOctokit.apps.getOrgInstallation).toHaveBeenCalled();
      expect(mockOctokit.apps.getRepoInstallation).not.toHaveBeenCalled();
    } else if (output.callReposInstallation) {
      expect(mockOctokit.apps.getRepoInstallation).toHaveBeenCalled();
      expect(mockOctokit.apps.getOrgInstallation).not.toHaveBeenCalled();
    } else {
      expect(createGithubAppAuth).not.toHaveBeenCalled();
    }
  });

  it('Should resolve installation again when event installation belongs to another app', async () => {
    const payload = {
      eventType: 'workflow_job',
      id: 0,
      installationId: 999,
      repositoryOwner: 'owner',
      repositoryName: 'repo',
    } as ActionRequestMessage;

    mockOctokit.apps.getOrgInstallation.mockResolvedValue({ data: { id: 123 } });

    vi.mocked(createGithubInstallationAuth)
      .mockRejectedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ token: 'token', type: 'installation', installationId: 123 });

    await expect(getOctokit('', true, payload)).resolves.toBeDefined();

    expect(createGithubAppAuth).toHaveBeenCalledTimes(1);
    expect(mockOctokit.apps.getOrgInstallation).toHaveBeenCalledWith({ org: 'owner' });
    expect(createGithubInstallationAuth).toHaveBeenNthCalledWith(1, 999, '');
    expect(createGithubInstallationAuth).toHaveBeenNthCalledWith(2, 123, '');
  });
});
