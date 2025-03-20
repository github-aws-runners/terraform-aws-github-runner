import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EC2Client, DescribeImagesCommand, DescribeLaunchTemplatesCommand, DescribeLaunchTemplateVersionsCommand, CreateLaunchTemplateVersionCommand, ModifyLaunchTemplateCommand } from '@aws-sdk/client-ec2';
import { AMIManager } from '../ami';

vi.mock('@aws-sdk/client-ec2');
vi.mock('../../shared/aws-powertools-util', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('AMIManager', () => {
  let ec2Client: EC2Client;
  let amiManager: AMIManager;

  beforeEach(() => {
    ec2Client = new EC2Client({});
    amiManager = new AMIManager(ec2Client);
    vi.clearAllMocks();
  });

  describe('getLatestAmi', () => {
    it('should return the latest AMI ID', async () => {
      const mockResponse = {
        Images: [
          { ImageId: 'ami-2', CreationDate: '2023-12-02' },
          { ImageId: 'ami-1', CreationDate: '2023-12-01' },
        ],
      };

      vi.mocked(ec2Client.send).mockResolvedValueOnce(mockResponse);

      const config = {
        owners: ['self'],
        filters: [{ name: 'tag:Environment', values: ['prod'] }],
      };

      const result = await amiManager.getLatestAmi(config);
      expect(result).toBe('ami-2');
      expect(ec2Client.send).toHaveBeenCalledWith(expect.any(DescribeImagesCommand));
    });

    it('should throw error when no AMIs found', async () => {
      vi.mocked(ec2Client.send).mockResolvedValueOnce({ Images: [] });

      const config = {
        owners: ['self'],
        filters: [{ name: 'tag:Environment', values: ['prod'] }],
      };

      await expect(amiManager.getLatestAmi(config)).rejects.toThrow('No matching AMIs found');
    });
  });

  describe('updateLaunchTemplate', () => {
    it('should update launch template with new AMI ID', async () => {
      vi.mocked(ec2Client.send)
        .mockResolvedValueOnce({ // getCurrentAmiId - DescribeLaunchTemplatesCommand
          LaunchTemplates: [{ LatestVersionNumber: 1 }],
        })
        .mockResolvedValueOnce({ // getCurrentAmiId - DescribeLaunchTemplateVersionsCommand
          LaunchTemplateVersions: [{ LaunchTemplateData: { ImageId: 'ami-old' } }],
        })
        .mockResolvedValueOnce({ // updateLaunchTemplate - DescribeLaunchTemplatesCommand
          LaunchTemplates: [{ LatestVersionNumber: 1 }],
        });

      const result = await amiManager.updateLaunchTemplate('test-template', 'ami-new', false);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Updated successfully');
      expect(ec2Client.send).toHaveBeenCalledWith(expect.any(CreateLaunchTemplateVersionCommand));
      expect(ec2Client.send).toHaveBeenCalledWith(expect.any(ModifyLaunchTemplateCommand));
    });

    it('should not update if AMI ID is the same', async () => {
      vi.mocked(ec2Client.send)
        .mockResolvedValueOnce({ // getCurrentAmiId - DescribeLaunchTemplatesCommand
          LaunchTemplates: [{ LatestVersionNumber: 1 }],
        })
        .mockResolvedValueOnce({ // getCurrentAmiId - DescribeLaunchTemplateVersionsCommand
          LaunchTemplateVersions: [{ LaunchTemplateData: { ImageId: 'ami-1' } }],
        });

      const result = await amiManager.updateLaunchTemplate('test-template', 'ami-1', false);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Already using latest AMI');
      expect(ec2Client.send).not.toHaveBeenCalledWith(expect.any(CreateLaunchTemplateVersionCommand));
    });

    it('should handle dry run mode', async () => {
      vi.mocked(ec2Client.send)
        .mockResolvedValueOnce({ // getCurrentAmiId - DescribeLaunchTemplatesCommand
          LaunchTemplates: [{ LatestVersionNumber: 1 }],
        })
        .mockResolvedValueOnce({ // getCurrentAmiId - DescribeLaunchTemplateVersionsCommand
          LaunchTemplateVersions: [{ LaunchTemplateData: { ImageId: 'ami-old' } }],
        });

      const result = await amiManager.updateLaunchTemplate('test-template', 'ami-new', true);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Would update AMI (Dry Run)');
      expect(ec2Client.send).not.toHaveBeenCalledWith(expect.any(CreateLaunchTemplateVersionCommand));
    });
  });
});