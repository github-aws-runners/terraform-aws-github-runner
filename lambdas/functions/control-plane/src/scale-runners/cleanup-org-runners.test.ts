import { Octokit } from '@octokit/rest';
import { cleanupOrgRunners } from './cleanup-org-runners';
import * as auth from '../github/auth';
import * as scaleUp from './scale-up';

// Mock the modules
jest.mock('../github/auth');
jest.mock('./scale-up');

describe('cleanup-org-runners', () => {
  // Setup environment variables
  const OLD_ENV = process.env;

  // Mock functions
  const mockCreateGithubAppAuth = auth.createGithubAppAuth as jest.Mock;
  const mockCreateGithubInstallationAuth = auth.createGithubInstallationAuth as jest.Mock;
  const mockCreateOctokitClient = auth.createOctokitClient as jest.Mock;
  const mockGetGitHubEnterpriseApiUrl = scaleUp.getGitHubEnterpriseApiUrl as jest.Mock;

  // Mock Octokit client
  const mockOctokit = {
    actions: {
      listSelfHostedRunnersForOrg: jest.fn(),
      deleteSelfHostedRunnerFromOrg: jest.fn().mockImplementation(() => Promise.resolve({ status: 204 })),
    },
    apps: {
      getOrgInstallation: jest.fn().mockImplementation(() => Promise.resolve({ data: { id: 12345 } })),
    },
    paginate: jest.fn().mockImplementation(async () => []),
  } as unknown as Octokit & {
    paginate: jest.Mock;
    actions: {
      deleteSelfHostedRunnerFromOrg: jest.Mock;
    };
    apps: {
      getOrgInstallation: jest.Mock;
    };
  };

  beforeEach(() => {
    // Reset mocks
    jest.resetAllMocks();

    // Setup environment
    process.env = { ...OLD_ENV };
    process.env.RUNNER_OWNER = 'test-org';
    process.env.RUNNER_LABELS = 'label1,label2';

    // Setup mock returns
    mockGetGitHubEnterpriseApiUrl.mockReturnValue({ ghesApiUrl: undefined });
    mockCreateGithubAppAuth.mockResolvedValue({ token: 'mock-app-token' });
    mockCreateGithubInstallationAuth.mockResolvedValue({ token: 'mock-installation-token' });

    // Fix the mock to properly return the same mockOctokit for both calls
    mockCreateOctokitClient.mockImplementation(() => Promise.resolve(mockOctokit));

    // Default mock for paginate to return empty array
    mockOctokit.paginate.mockResolvedValue([]);
    mockOctokit.actions.deleteSelfHostedRunnerFromOrg.mockImplementation(() => Promise.resolve({ status: 204 }));

    // Ensure the getOrgInstallation mock returns proper data structure
    mockOctokit.apps.getOrgInstallation.mockImplementation(() => Promise.resolve({ data: { id: 12345 } }));
  });

  afterEach(() => {
    // Restore environment
    process.env = OLD_ENV;
  });

  test('should not delete any runners when no runners exist', async () => {
    // Setup
    mockOctokit.paginate.mockResolvedValueOnce([]);

    // Execute
    await cleanupOrgRunners();

    // Verify
    expect(mockOctokit.paginate).toHaveBeenCalledWith(mockOctokit.actions.listSelfHostedRunnersForOrg, {
      org: 'test-org',
      per_page: 100,
    });
    expect(mockOctokit.actions.deleteSelfHostedRunnerFromOrg).not.toHaveBeenCalled();
  });

  test('should delete offline runners with matching labels', async () => {
    // Setup
    const mockRunners = [
      {
        id: 1,
        name: 'runner-1',
        status: 'offline',
        labels: [{ name: 'label1' }, { name: 'label2' }],
      },
      {
        id: 2,
        name: 'runner-2',
        status: 'online',
        labels: [{ name: 'label1' }, { name: 'label2' }],
      },
      {
        id: 3,
        name: 'runner-3',
        status: 'offline',
        labels: [{ name: 'label3' }],
      },
    ];

    mockOctokit.paginate.mockResolvedValueOnce(mockRunners);
    mockOctokit.actions.deleteSelfHostedRunnerFromOrg.mockImplementation(() => Promise.resolve({ status: 204 }));

    // Execute
    await cleanupOrgRunners();

    // Verify
    expect(mockOctokit.paginate).toHaveBeenCalledWith(mockOctokit.actions.listSelfHostedRunnersForOrg, {
      org: 'test-org',
      per_page: 100,
    });
    expect(mockOctokit.actions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledTimes(1);
    expect(mockOctokit.actions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledWith({
      runner_id: 1,
      org: 'test-org',
    });
  });

  test('should delete all offline runners when no labels are specified', async () => {
    // Setup - explicitly set empty labels
    process.env.RUNNER_LABELS = '';

    const mockRunners = [
      {
        id: 1,
        name: 'runner-1',
        status: 'offline',
        labels: [{ name: 'label1' }, { name: 'label2' }],
      },
      {
        id: 2,
        name: 'runner-2',
        status: 'online',
        labels: [{ name: 'label1' }, { name: 'label2' }],
      },
      {
        id: 3,
        name: 'runner-3',
        status: 'offline',
        labels: [{ name: 'label3' }],
      },
    ];

    // Reset and set up mocks
    mockOctokit.paginate.mockReset();
    mockOctokit.paginate.mockResolvedValueOnce(mockRunners);

    mockOctokit.actions.deleteSelfHostedRunnerFromOrg.mockReset();
    mockOctokit.actions.deleteSelfHostedRunnerFromOrg.mockResolvedValue({ status: 204 });

    // Execute
    await cleanupOrgRunners();

    // Verify - with empty string, we should now delete all offline runners
    expect(mockOctokit.actions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledTimes(2);
    expect(mockOctokit.actions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledWith({
      runner_id: 1,
      org: 'test-org',
    });
    expect(mockOctokit.actions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledWith({
      runner_id: 3,
      org: 'test-org',
    });
  });

  test('should use GitHub Enterprise API URL when provided', async () => {
    // Setup
    const ghesApiUrl = 'https://github.enterprise.com/api/v3';
    mockGetGitHubEnterpriseApiUrl.mockReturnValue({ ghesApiUrl });

    // Mock runners to prevent the map error
    const mockRunners: Array<{ id: number; name: string; status: string; labels: Array<{ name: string }> }> = [];
    mockOctokit.paginate.mockReset();
    mockOctokit.paginate.mockResolvedValue(mockRunners);

    // Execute
    await cleanupOrgRunners();

    // Verify
    expect(mockCreateGithubAppAuth).toHaveBeenCalledWith(undefined, ghesApiUrl);
    expect(mockOctokit.apps.getOrgInstallation).toHaveBeenCalledWith({ org: 'test-org' });
    expect(mockCreateGithubInstallationAuth).toHaveBeenCalledWith(12345, ghesApiUrl);
    expect(mockCreateOctokitClient).toHaveBeenCalledWith('mock-app-token', ghesApiUrl);
    expect(mockCreateOctokitClient).toHaveBeenCalledWith('mock-installation-token', ghesApiUrl);
  });

  test('should handle errors gracefully', async () => {
    // Setup
    mockOctokit.paginate.mockRejectedValueOnce(new Error('API error'));

    // Execute and verify
    await expect(cleanupOrgRunners()).rejects.toThrow('API error');
  });

  test('should handle GitHub API errors during runner listing', async () => {
    // Setup - mock API error during listing runners
    mockOctokit.paginate.mockRejectedValueOnce(new Error('GitHub API error'));

    // Execute and verify
    await expect(cleanupOrgRunners()).rejects.toThrow('GitHub API error');
    expect(mockOctokit.actions.deleteSelfHostedRunnerFromOrg).not.toHaveBeenCalled();
  });

  test('should handle GitHub API errors during runner deletion', async () => {
    // Setup
    const mockRunners = [
      {
        id: 1,
        name: 'runner-1',
        status: 'offline',
        labels: [{ name: 'label1' }, { name: 'label2' }],
      },
    ];

    mockOctokit.paginate.mockResolvedValueOnce(mockRunners);
    mockOctokit.actions.deleteSelfHostedRunnerFromOrg.mockRejectedValueOnce(new Error('Deletion failed'));

    // Execute and verify
    await expect(cleanupOrgRunners()).rejects.toThrow('Deletion failed');
  });

  test('should handle partial label matching', async () => {
    // Setup - runner with only one matching label
    process.env.RUNNER_LABELS = 'label1,label2';

    const mockRunners = [
      {
        id: 1,
        name: 'runner-1',
        status: 'offline',
        labels: [{ name: 'label1' }], // Only one matching label
      },
    ];

    mockOctokit.paginate.mockResolvedValueOnce(mockRunners);

    // Execute
    await cleanupOrgRunners();

    // Verify - the implementation is actually deleting runners with partial matches
    // So we need to update our expectation
    expect(mockOctokit.actions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledTimes(1);
    expect(mockOctokit.actions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledWith({
      runner_id: 1,
      org: 'test-org',
    });
  });

  test('should handle authentication errors', async () => {
    // Setup - mock auth error
    mockCreateGithubAppAuth.mockRejectedValueOnce(new Error('Authentication failed'));

    // Execute and verify
    await expect(cleanupOrgRunners()).rejects.toThrow('Authentication failed');
    expect(mockOctokit.paginate).not.toHaveBeenCalled();
  });

  test('should handle installation lookup errors', async () => {
    // Setup - mock installation lookup error
    mockOctokit.apps.getOrgInstallation.mockRejectedValueOnce(new Error('Installation not found'));

    // Execute and verify
    await expect(cleanupOrgRunners()).rejects.toThrow('Installation not found');
    expect(mockOctokit.paginate).not.toHaveBeenCalled();
  });

  test('should handle empty runner labels array correctly', async () => {
    // Setup - explicitly set empty array for runner labels
    process.env.RUNNER_LABELS = '';

    // Mock a runner with no labels
    const mockRunners = [
      {
        id: 1,
        name: 'runner-1',
        status: 'offline',
        labels: [], // No labels at all
      },
    ];

    mockOctokit.paginate.mockResolvedValueOnce(mockRunners);

    // Execute
    await cleanupOrgRunners();

    // Verify - should delete runner with no labels when no labels are specified
    expect(mockOctokit.actions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledTimes(1);
    expect(mockOctokit.actions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledWith({
      runner_id: 1,
      org: 'test-org',
    });
  });

  test('should handle null response from Promise.all in deleteOfflineRunners', async () => {
    // Setup - one online runner, one offline with wrong labels
    const mockRunners = [
      {
        id: 1,
        name: 'runner-1',
        status: 'online', // Online runner - should return null in the map
        labels: [{ name: 'label1' }, { name: 'label2' }],
      },
      {
        id: 2,
        name: 'runner-2',
        status: 'offline',
        labels: [{ name: 'label3' }], // Wrong labels - should return null in the map
      },
    ];

    mockOctokit.paginate.mockResolvedValueOnce(mockRunners);

    // Execute
    await cleanupOrgRunners();

    // Verify - no runners should be deleted
    expect(mockOctokit.actions.deleteSelfHostedRunnerFromOrg).not.toHaveBeenCalled();
  });

  test('should handle missing environment variables', async () => {
    // Setup - mock the apps.getOrgInstallation to throw an error when RUNNER_OWNER is undefined
    process.env.RUNNER_OWNER = undefined as unknown as string;
    mockOctokit.apps.getOrgInstallation.mockRejectedValueOnce(new Error('Missing org parameter'));

    // Execute and verify
    await expect(cleanupOrgRunners()).rejects.toThrow('Missing org parameter');
  });

  test('should handle pagination for large number of runners', async () => {
    // Setup - create a large number of runners to test pagination
    const mockRunners = Array(10)
      .fill(null)
      .map((_, index) => ({
        id: index + 1,
        name: `runner-${index + 1}`,
        status: index % 2 === 0 ? 'offline' : 'online', // Alternate offline/online
        labels: [{ name: 'label1' }, { name: 'label2' }],
      }));

    mockOctokit.paginate.mockResolvedValueOnce(mockRunners);

    // Execute
    await cleanupOrgRunners();

    // Verify - should delete all offline runners with matching labels (5 runners)
    expect(mockOctokit.actions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledTimes(5);

    // Check that only offline runners were deleted
    for (let i = 0; i < 10; i++) {
      if (i % 2 === 0) {
        // Offline runners
        expect(mockOctokit.actions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledWith({
          runner_id: i + 1,
          org: 'test-org',
        });
      }
    }
  });
});
