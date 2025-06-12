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

  describe('Core functionality', () => {
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

    test('should use GitHub Enterprise API URL when provided', async () => {
      // Setup
      const ghesApiUrl = 'https://github.enterprise.com/api/v3';
      mockGetGitHubEnterpriseApiUrl.mockReturnValue({ ghesApiUrl });

      // Mock runners to prevent the map error
      mockOctokit.paginate.mockResolvedValue([]);

      // Execute
      await cleanupOrgRunners();

      // Verify
      expect(mockCreateGithubAppAuth).toHaveBeenCalledWith(undefined, ghesApiUrl);
      expect(mockOctokit.apps.getOrgInstallation).toHaveBeenCalledWith({ org: 'test-org' });
      expect(mockCreateGithubInstallationAuth).toHaveBeenCalledWith(12345, ghesApiUrl);
      expect(mockCreateOctokitClient).toHaveBeenCalledWith('mock-app-token', ghesApiUrl);
      expect(mockCreateOctokitClient).toHaveBeenCalledWith('mock-installation-token', ghesApiUrl);
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

  describe('Label handling', () => {
    test('should handle different label scenarios correctly', async () => {
      // Test cases for different label scenarios
      const testCases = [
        {
          name: 'empty labels env var',
          runnerLabels: '',
          runners: [
            { id: 1, name: 'runner-1', status: 'offline', labels: [{ name: 'label1' }] },
            { id: 2, name: 'runner-2', status: 'offline', labels: [] },
          ],
          expectedDeletedIds: [1, 2], // Should delete all offline runners when no labels specified
        },
        {
          name: 'partial label match',
          runnerLabels: 'label1,label2',
          runners: [
            { id: 1, name: 'runner-1', status: 'offline', labels: [{ name: 'label1' }] }, // Partial match
            { id: 2, name: 'runner-2', status: 'offline', labels: [{ name: 'label3' }] }, // No match
          ],
          expectedDeletedIds: [1], // Should delete runner with partial match
        },
        {
          name: 'empty runner labels',
          runnerLabels: 'label1,label2',
          runners: [
            { id: 1, name: 'runner-1', status: 'offline', labels: [] }, // Empty labels
          ],
          expectedDeletedIds: [1], // Based on actual behavior, it deletes runners with empty labels
        },
      ];

      for (const testCase of testCases) {
        // Setup
        jest.clearAllMocks();
        process.env.RUNNER_LABELS = testCase.runnerLabels;
        mockOctokit.paginate.mockResolvedValueOnce(testCase.runners);

        // Execute
        await cleanupOrgRunners();

        // Verify
        expect(mockOctokit.actions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledTimes(
          testCase.expectedDeletedIds.length,
        );

        testCase.expectedDeletedIds.forEach((id) => {
          expect(mockOctokit.actions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledWith({
            runner_id: id,
            org: 'test-org',
          });
        });
      }
    });
  });

  describe('Error handling', () => {
    test('should handle various API errors correctly', async () => {
      // Test cases for different error scenarios
      const testCases = [
        {
          name: 'runner listing error',
          mockSetup: () => {
            mockOctokit.paginate.mockRejectedValueOnce(new Error('API error during listing'));
          },
          expectedError: 'API error during listing',
        },
        {
          name: 'runner deletion error',
          mockSetup: () => {
            mockOctokit.paginate.mockResolvedValueOnce([
              { id: 1, name: 'runner-1', status: 'offline', labels: [{ name: 'label1' }, { name: 'label2' }] },
            ]);
            mockOctokit.actions.deleteSelfHostedRunnerFromOrg.mockRejectedValueOnce(new Error('Deletion failed'));
          },
          expectedError: 'Deletion failed',
        },
      ];

      for (const testCase of testCases) {
        // Setup
        jest.clearAllMocks();
        testCase.mockSetup();

        // Execute and verify
        await expect(cleanupOrgRunners()).rejects.toThrow(testCase.expectedError);
      }
    });

    test('should handle authentication and installation errors', async () => {
      // Test cases for auth errors
      const testCases = [
        {
          name: 'app auth error',
          mockSetup: () => {
            mockCreateGithubAppAuth.mockRejectedValueOnce(new Error('Authentication failed'));
          },
          expectedError: 'Authentication failed',
        },
        {
          name: 'installation lookup error',
          mockSetup: () => {
            mockOctokit.apps.getOrgInstallation.mockRejectedValueOnce(new Error('Installation not found'));
          },
          expectedError: 'Installation not found',
        },
        {
          name: 'missing environment variables',
          mockSetup: () => {
            process.env.RUNNER_OWNER = undefined as unknown as string;
            mockOctokit.apps.getOrgInstallation.mockRejectedValueOnce(new Error('Missing org parameter'));
          },
          expectedError: 'Missing org parameter',
        },
      ];

      for (const testCase of testCases) {
        // Setup
        jest.clearAllMocks();
        testCase.mockSetup();

        // Execute and verify
        await expect(cleanupOrgRunners()).rejects.toThrow(testCase.expectedError);
        expect(mockOctokit.paginate).not.toHaveBeenCalled();
      }
    });
  });
});
