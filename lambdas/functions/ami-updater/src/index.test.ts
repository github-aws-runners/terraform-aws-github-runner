import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from './lambda';
import { AMIManager } from './ami';
import { getConfig } from './config';

vi.mock('./ami');
vi.mock('./config');
vi.mock('@aws-github-runner/aws-powertools-util', () => ({
  logger: {
    addContext: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Lambda Handler', () => {
  const mockContext = {
    awsRequestId: 'test-request-id',
    functionName: 'test-function',
  };

  const mockConfig = {
    launchTemplateName: 'test-template',
    dryRun: false,
    amiFilter: {
      owners: ['self'],
      filters: [{ Name: 'tag:Environment', Values: ['prod'] }],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getConfig).mockReturnValue(mockConfig);
  });

  it('should successfully update AMI', async () => {
    vi.mocked(AMIManager.prototype.getLatestAmi).mockResolvedValue('ami-new');
    vi.mocked(AMIManager.prototype.updateLaunchTemplate).mockResolvedValue({
      success: true,
      message: 'Updated successfully',
    });

    await handler({}, mockContext);

    expect(AMIManager.prototype.getLatestAmi).toHaveBeenCalledWith(mockConfig.amiFilter);
    expect(AMIManager.prototype.updateLaunchTemplate).toHaveBeenCalledWith(
      mockConfig.launchTemplateName,
      'ami-new',
      mockConfig.dryRun,
    );
  });

  it('should handle failed AMI update', async () => {
    vi.mocked(AMIManager.prototype.getLatestAmi).mockResolvedValue('ami-new');
    vi.mocked(AMIManager.prototype.updateLaunchTemplate).mockResolvedValue({
      success: false,
      message: 'Update failed',
    });

    await expect(handler({}, mockContext)).rejects.toThrow('Update failed');
  });

  it('should handle errors in getLatestAmi', async () => {
    const error = new Error('Failed to get AMI');
    vi.mocked(AMIManager.prototype.getLatestAmi).mockRejectedValue(error);

    await expect(handler({}, mockContext)).rejects.toThrow('Failed to get AMI');
  });

  it('should handle errors in updateLaunchTemplate', async () => {
    vi.mocked(AMIManager.prototype.getLatestAmi).mockResolvedValue('ami-new');
    const error = new Error('Failed to update template');
    vi.mocked(AMIManager.prototype.updateLaunchTemplate).mockRejectedValue(error);

    await expect(handler({}, mockContext)).rejects.toThrow('Failed to update template');
  });
});
