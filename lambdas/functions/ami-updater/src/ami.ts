import {
  EC2Client,
  DescribeImagesCommand,
  DescribeLaunchTemplatesCommand,
  DescribeLaunchTemplateVersionsCommand,
  CreateLaunchTemplateVersionCommand,
  ModifyLaunchTemplateCommand,
  Image,
  Filter,
} from '@aws-sdk/client-ec2';
import { logger } from '@aws-github-runner/aws-powertools-util';

export interface AMIFilterConfig {
  owners: string[];
  filters: Filter[];
}

export class AMIManager {
  constructor(private readonly ec2Client: EC2Client) {}

  async getLatestAmi(config: AMIFilterConfig): Promise<string> {
    try {
      const response = await this.ec2Client.send(
        new DescribeImagesCommand({
          Owners: config.owners,
          Filters: config.filters,
        }),
      );

      if (!response.Images || response.Images.length === 0) {
        throw new Error('No matching AMIs found');
      }

      // Sort by creation date to get the latest
      const sortedImages = response.Images.sort((a: Image, b: Image) => {
        return (b.CreationDate || '').localeCompare(a.CreationDate || '');
      });

      if (!sortedImages[0].ImageId) {
        throw new Error('Latest AMI has no ImageId');
      }

      return sortedImages[0].ImageId;
    } catch (error) {
      logger.error('Error getting latest AMI', { error });
      throw error;
    }
  }

  async getCurrentAmiId(templateName: string): Promise<string | null> {
    try {
      const response = await this.ec2Client.send(
        new DescribeLaunchTemplatesCommand({
          LaunchTemplateNames: [templateName],
        }),
      );

      if (!response.LaunchTemplates || response.LaunchTemplates.length === 0) {
        logger.warn(`Launch template ${templateName} not found`);
        return null;
      }

      const latestVersion = response.LaunchTemplates[0].LatestVersionNumber?.toString();
      if (!latestVersion) {
        logger.warn('No latest version found for launch template');
        return null;
      }

      const templateData = await this.ec2Client.send(
        new DescribeLaunchTemplateVersionsCommand({
          LaunchTemplateName: templateName,
          Versions: [latestVersion],
        }),
      );

      return templateData.LaunchTemplateVersions?.[0]?.LaunchTemplateData?.ImageId || null;
    } catch (error) {
      logger.error(`Error getting current AMI ID for ${templateName}`, { error });
      return null;
    }
  }

  async updateLaunchTemplate(
    templateName: string,
    amiId: string,
    dryRun: boolean,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const currentAmi = await this.getCurrentAmiId(templateName);
      if (!currentAmi) {
        return { success: false, message: 'Failed to get current AMI ID' };
      }

      if (currentAmi === amiId) {
        logger.info(`Template ${templateName} already using latest AMI ${amiId}`);
        return { success: true, message: 'Already using latest AMI' };
      }

      if (dryRun) {
        logger.info(`[DRY RUN] Would update template ${templateName} from AMI ${currentAmi} to ${amiId}`);
        return { success: true, message: 'Would update AMI (Dry Run)' };
      }

      // Get the latest version of the launch template
      const response = await this.ec2Client.send(
        new DescribeLaunchTemplatesCommand({
          LaunchTemplateNames: [templateName],
        }),
      );

      if (!response.LaunchTemplates || response.LaunchTemplates.length === 0) {
        logger.warn(`Launch template ${templateName} not found`);
        return { success: false, message: 'Template not found' };
      }

      // Create new version with updated AMI ID
      await this.ec2Client.send(
        new CreateLaunchTemplateVersionCommand({
          LaunchTemplateName: templateName,
          SourceVersion: response.LaunchTemplates[0].LatestVersionNumber?.toString(),
          LaunchTemplateData: { ImageId: amiId },
        }),
      );

      // Set the new version as default
      await this.ec2Client.send(
        new ModifyLaunchTemplateCommand({
          LaunchTemplateName: templateName,
          DefaultVersion: '$Latest',
        }),
      );

      logger.info(`Successfully updated launch template ${templateName} from AMI ${currentAmi} to ${amiId}`);
      return { success: true, message: 'Updated successfully' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error updating launch template ${templateName}`, { error });
      return { success: false, message: `Error: ${errorMessage}` };
    }
  }
}
