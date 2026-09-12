import { Octokit } from '@octokit/rest';
import type { ActionRequestMessage } from '../scale-runners/types';
import { getOctokit, getOctokitWithFailover } from './octokit';
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import {
  createGithubAppAuth,
  createGithubInstallationAuth,
  getStoredInstallationId,
  hasAlternativeAppWithHeadroom,
  isGitHubRateLimitError,
} from '../github/auth';

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
  hasAlternativeAppWithHeadroom: vi.fn().mockReturnValue(false),
  isGitHubRateLimitError: vi.fn().mockReturnValue(false),
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

describe('Test getOctokit stale installation fallback', () => {
  const basePayload = {
    eventType: 'workflow_job',
    id: 0,
    repositoryOwner: 'owner',
    repositoryName: 'repo',
  } as Omit<ActionRequestMessage, 'installationId'>;

  beforeEach(() => {
    vi.clearAllMocks();
    (createGithubAppAuth as Mock).mockResolvedValue({ token: 'token', appIndex: 0 });
    (getStoredInstallationId as Mock).mockResolvedValue(undefined);
    mockOctokit.apps.getOrgInstallation.mockResolvedValue({ data: { id: 99 } });
  });

  it('re-resolves the installation and retries with the same app when the payload id is stale (404)', async () => {
    const notFound = Object.assign(new Error('Not Found'), { status: 404 });
    (createGithubInstallationAuth as Mock)
      .mockRejectedValueOnce(notFound)
      .mockResolvedValueOnce({ token: 'fresh-token', type: 'installation', installationId: 99 });

    const payload = { ...basePayload, installationId: 5 } as ActionRequestMessage;
    await expect(getOctokit('', true, payload)).resolves.toBeDefined();

    expect(createGithubInstallationAuth).toHaveBeenNthCalledWith(1, 5, '', 0);
    expect(createGithubInstallationAuth).toHaveBeenNthCalledWith(2, 99, '', 0);
    expect(mockOctokit.apps.getOrgInstallation).toHaveBeenCalledWith({ org: 'owner' });
  });

  it('rethrows when re-resolution returns the same installation id', async () => {
    const notFound = Object.assign(new Error('Not Found'), { status: 404 });
    mockOctokit.apps.getOrgInstallation.mockResolvedValue({ data: { id: 5 } });
    (createGithubInstallationAuth as Mock).mockRejectedValueOnce(notFound);

    const payload = { ...basePayload, installationId: 5 } as ActionRequestMessage;
    await expect(getOctokit('', true, payload)).rejects.toThrow('Not Found');
    expect(createGithubInstallationAuth).toHaveBeenCalledTimes(1);
  });

  it('rethrows non-404 errors without re-resolving', async () => {
    const serverError = Object.assign(new Error('Server Error'), { status: 500 });
    (createGithubInstallationAuth as Mock).mockRejectedValueOnce(serverError);

    const payload = { ...basePayload, installationId: 5 } as ActionRequestMessage;
    await expect(getOctokit('', true, payload)).rejects.toThrow('Server Error');
    expect(mockOctokit.apps.getOrgInstallation).not.toHaveBeenCalled();
    expect(createGithubInstallationAuth).toHaveBeenCalledTimes(1);
  });
});

describe('Test getOctokitWithFailover', () => {
  const payload = {
    eventType: 'workflow_job',
    id: 0,
    installationId: 5,
    repositoryOwner: 'owner',
    repositoryName: 'repo',
  } as ActionRequestMessage;

  beforeEach(() => {
    vi.clearAllMocks();
    (getStoredInstallationId as Mock).mockResolvedValue(undefined);
  });

  it('passes every already-tried app index through to app selection when retrying', async () => {
    (createGithubAppAuth as Mock).mockResolvedValue({ token: 'token', appIndex: 0 });
    (isGitHubRateLimitError as Mock).mockReturnValue(true);
    (hasAlternativeAppWithHeadroom as Mock).mockReturnValue(true);

    const rateLimitError = Object.assign(new Error('rate limit exceeded'), { status: 403 });
    const work = vi.fn().mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce('done');

    await expect(getOctokitWithFailover('', true, payload, work)).resolves.toBe('done');

    expect(createGithubAppAuth).toHaveBeenNthCalledWith(1, undefined, '', undefined, undefined, []);
    expect(createGithubAppAuth).toHaveBeenNthCalledWith(2, undefined, '', undefined, undefined, [0]);
    expect(work).toHaveBeenCalledTimes(2);
  });

  it('keeps failing over past a second exhausted app with 3+ configured apps', async () => {
    (createGithubAppAuth as Mock)
      .mockResolvedValueOnce({ token: 'token', appIndex: 0 })
      .mockResolvedValueOnce({ token: 'token', appIndex: 1 })
      .mockResolvedValueOnce({ token: 'token', appIndex: 2 });
    (isGitHubRateLimitError as Mock).mockReturnValue(true);
    (hasAlternativeAppWithHeadroom as Mock).mockReturnValue(true);

    const rateLimitError = Object.assign(new Error('rate limit exceeded'), { status: 403 });
    const work = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError) // app 0 exhausted
      .mockRejectedValueOnce(rateLimitError) // app 1 also exhausted
      .mockResolvedValueOnce('done'); // app 2 has headroom

    await expect(getOctokitWithFailover('', true, payload, work)).resolves.toBe('done');

    expect(createGithubAppAuth).toHaveBeenNthCalledWith(1, undefined, '', undefined, undefined, []);
    expect(createGithubAppAuth).toHaveBeenNthCalledWith(2, undefined, '', undefined, undefined, [0]);
    expect(createGithubAppAuth).toHaveBeenNthCalledWith(3, undefined, '', undefined, undefined, [0, 1]);
    expect(work).toHaveBeenCalledTimes(3);
  });

  it('gives up after a bounded number of failover attempts instead of looping forever', async () => {
    let nextAppIndex = 0;
    (createGithubAppAuth as Mock).mockImplementation(async () => ({ token: 'token', appIndex: nextAppIndex++ }));
    (isGitHubRateLimitError as Mock).mockReturnValue(true);
    (hasAlternativeAppWithHeadroom as Mock).mockReturnValue(true); // pretend there's always another app

    const rateLimitError = Object.assign(new Error('rate limit exceeded'), { status: 403 });
    const work = vi.fn().mockRejectedValue(rateLimitError);

    await expect(getOctokitWithFailover('', true, payload, work)).rejects.toThrow('rate limit exceeded');
    expect(work.mock.calls.length).toBeLessThan(20);
  });

  it('does not retry when the error is not a rate limit error', async () => {
    (createGithubAppAuth as Mock).mockResolvedValue({ token: 'token', appIndex: 0 });
    (isGitHubRateLimitError as Mock).mockReturnValue(false);

    const otherError = new Error('boom');
    const work = vi.fn().mockRejectedValueOnce(otherError);

    await expect(getOctokitWithFailover('', true, payload, work)).rejects.toThrow('boom');
    expect(work).toHaveBeenCalledTimes(1);
    expect(createGithubAppAuth).toHaveBeenCalledTimes(1);
  });

  it('does not retry when no alternate app has headroom', async () => {
    (createGithubAppAuth as Mock).mockResolvedValue({ token: 'token', appIndex: 0 });
    (isGitHubRateLimitError as Mock).mockReturnValue(true);
    (hasAlternativeAppWithHeadroom as Mock).mockReturnValue(false);

    const rateLimitError = Object.assign(new Error('rate limit exceeded'), { status: 403 });
    const work = vi.fn().mockRejectedValueOnce(rateLimitError);

    await expect(getOctokitWithFailover('', true, payload, work)).rejects.toThrow('rate limit exceeded');
    expect(work).toHaveBeenCalledTimes(1);
    expect(createGithubAppAuth).toHaveBeenCalledTimes(1);
  });
});
