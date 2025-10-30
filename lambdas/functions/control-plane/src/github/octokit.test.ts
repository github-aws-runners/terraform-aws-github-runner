import { Octokit } from '@octokit/rest';
import { ActionRequestMessage } from '../scale-runners/scale-up';
import { getOctokit } from './octokit';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockOctokit = {
  apps: {
    getOrgInstallation: vi.fn(),
    getRepoInstallation: vi.fn(),
  },
};

function setDefaults() {
  process.env.PARAMETER_ENTERPRISE_PAT_NAME = 'github-pat-id';
}

vi.mock('../github/auth', async () => ({
  createGithubInstallationAuth: vi.fn().mockImplementation(async (installationId) => {
    return { token: 'token', type: 'installation', installationId: installationId };
  }),
  createOctokitClient: vi.fn().mockImplementation(() => new Octokit()),
  createGithubAppAuth: vi.fn().mockResolvedValue({ token: 'token' }),
}));

vi.mock('@octokit/rest', async () => ({
  Octokit: vi.fn().mockImplementation(() => mockOctokit),
}));

vi.mock('@aws-github-runner/aws-ssm-util', async () => {
  const actual = (await vi.importActual(
    '@aws-github-runner/aws-ssm-util',
  )) as typeof import('@aws-github-runner/aws-ssm-util');

  return {
    ...actual,
    getParameter: vi.fn(),
  };
});

// We've already mocked '../github/auth' above

describe('Test getOctokit', () => {
  const data = [
    {
      description: 'Should look-up org installation if installationId is 0.',
      input: { enableEnterpriseLevel: false, orgLevelRunner: false, installationId: 0 },
      output: { callEnterpriseToken: false, callReposInstallation: true, callOrgInstallation: false },
    },
    {
      description: 'Should look-up org installation if installationId is 0.',
      input: { enableEnterpriseLevel: false, orgLevelRunner: true, installationId: 0 },
      output: { callEnterpriseToken: false, callReposInstallation: false, callOrgInstallation: true },
    },
    {
      description: 'Should not look-up org installation if provided in payload.',
      input: { enableEnterpriseLevel: false, orgLevelRunner: true, installationId: 1 },
      output: { callEnterpriseToken: false, callReposInstallation: false, callOrgInstallation: false },
    },
    {
      description: 'Should not look-up org installation if enterprise is enabled.',
      input: { enableEnterpriseLevel: true, orgLevelRunner: false, installationId: 1 },
      output: { callEnterpriseToken: true, callReposInstallation: false, callOrgInstallation: false },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    setDefaults();
  });

  it.each(data)(`$description`, async ({ input, output }) => {
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

    await expect(getOctokit('', input.enableEnterpriseLevel, input.orgLevelRunner, payload)).resolves.toBeDefined();

    if (output.callEnterpriseToken) {
      expect(mockOctokit.apps.getOrgInstallation).not.toHaveBeenCalled();
      expect(mockOctokit.apps.getRepoInstallation).not.toHaveBeenCalled();
    } else if (output.callOrgInstallation) {
      expect(mockOctokit.apps.getOrgInstallation).toHaveBeenCalled();
      expect(mockOctokit.apps.getRepoInstallation).not.toHaveBeenCalled();
    } else if (output.callReposInstallation) {
      expect(mockOctokit.apps.getRepoInstallation).toHaveBeenCalled();
      expect(mockOctokit.apps.getOrgInstallation).not.toHaveBeenCalled();
    }
  });
});
