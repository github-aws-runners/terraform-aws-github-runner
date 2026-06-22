import { Octokit } from '@octokit/rest';
import { ActionRequestMessage } from '../scale-runners/scale-up';
import { getOctokit } from './octokit';
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { createGithubAppAuth, getStoredInstallationId } from '../github/auth';

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
  createGithubAppAuth: vi.fn().mockResolvedValue({ token: 'token', appIndex: 0 }),
  getAppCount: vi.fn().mockResolvedValue(1),
  getStoredInstallationId: vi.fn().mockResolvedValue(undefined),
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
      expect(mockOctokit.apps.getOrgInstallation).not.toHaveBeenCalled();
      expect(mockOctokit.apps.getRepoInstallation).not.toHaveBeenCalled();
    }
  });
});

describe('Test getOctokit installation ID resolution (Fix B: index-0 payload reuse in multi-app)', () => {
  const basePayload = {
    eventType: 'workflow_job',
    id: 0,
    repositoryOwner: 'owner',
    repositoryName: 'repo',
  } as Omit<ActionRequestMessage, 'installationId'>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOctokit.apps.getOrgInstallation.mockResolvedValue({ data: { id: 99 } });
    mockOctokit.apps.getRepoInstallation.mockResolvedValue({ data: { id: 99 } });
  });

  it('primary app (appIndex 0) reuses webhook installationId even in multi-app deployment', async () => {
    // Multi-app deployment: primary app selected (index 0), no stored installation id
    (createGithubAppAuth as Mock).mockResolvedValue({ token: 'token', appIndex: 0 });
    (getStoredInstallationId as Mock).mockResolvedValue(undefined);
    const payload = { ...basePayload, installationId: 5 } as ActionRequestMessage;

    await expect(getOctokit('', true, payload)).resolves.toBeDefined();

    // Primary app must NOT do an API lookup — it reuses the webhook payload installationId
    expect(mockOctokit.apps.getOrgInstallation).not.toHaveBeenCalled();
    expect(mockOctokit.apps.getRepoInstallation).not.toHaveBeenCalled();
  });

  it('additional app (appIndex 1) does API lookup even when webhook has installationId', async () => {
    // Multi-app deployment: additional app selected (index 1), no stored installation id
    (createGithubAppAuth as Mock).mockResolvedValue({ token: 'token', appIndex: 1 });
    (getStoredInstallationId as Mock).mockResolvedValue(undefined);
    const payload = { ...basePayload, installationId: 5 } as ActionRequestMessage;

    await expect(getOctokit('', true, payload)).resolves.toBeDefined();

    // Additional app must do an API lookup (it cannot reuse the webhook payload)
    expect(mockOctokit.apps.getOrgInstallation).toHaveBeenCalled();
  });

  it('stored installation id takes precedence over payload for additional app', async () => {
    // Additional app with a pre-configured installation id stored
    (createGithubAppAuth as Mock).mockResolvedValue({ token: 'token', appIndex: 1 });
    (getStoredInstallationId as Mock).mockResolvedValue(77);
    const payload = { ...basePayload, installationId: 5 } as ActionRequestMessage;

    await expect(getOctokit('', true, payload)).resolves.toBeDefined();

    // Stored id wins: no API lookup needed
    expect(mockOctokit.apps.getOrgInstallation).not.toHaveBeenCalled();
    expect(mockOctokit.apps.getRepoInstallation).not.toHaveBeenCalled();
  });
});
