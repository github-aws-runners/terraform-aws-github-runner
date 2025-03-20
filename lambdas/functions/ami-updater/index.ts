import { EC2Client, DescribeImagesCommand, Image } from '@aws-sdk/client-ec2';
import { SSMClient, GetParameterCommand, PutParameterCommand } from '@aws-sdk/client-ssm';
import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({ serviceName: process.env.POWERTOOLS_SERVICE_NAME });
const DRY_RUN = process.env.DRY_RUN?.toLowerCase() === 'true';
const SSM_PARAMETER_NAME = process.env.SSM_PARAMETER_NAME || '/github-action-runners/latest_ami_id';
const AMI_FILTER = JSON.parse(process.env.AMI_FILTER || '{}');

const ec2Client = new EC2Client({});
const ssmClient = new SSMClient({});

async function getLatestAmi(): Promise<Image> {
  try {
    const command = new DescribeImagesCommand({
      Owners: AMI_FILTER.owners,
      Filters: AMI_FILTER.filters,
    });

    const response = await ec2Client.send(command);
    const images = response.Images || [];

    if (images.length === 0) {
      throw new Error('No matching AMIs found');
    }

    // Sort by creation date to get the latest
    const sortedImages = images.sort((a, b) => {
      return (b.CreationDate || '').localeCompare(a.CreationDate || '');
    });

    return sortedImages[0];
  } catch (error) {
    logger.error('Error getting latest AMI', { error });
    throw error;
  }
}

async function getCurrentAmiId(): Promise<string | null> {
  try {
    const command = new GetParameterCommand({
      Name: SSM_PARAMETER_NAME,
    });

    const response = await ssmClient.send(command);
    return response.Parameter?.Value || null;
  } catch (error: any) {
    if (error.name === 'ParameterNotFound') {
      logger.info(`Parameter ${SSM_PARAMETER_NAME} not found`);
      return null;
    }
    logger.error('Error getting current AMI ID from SSM', { error });
    throw error;
  }
}

async function updateAmiParameter(amiId: string): Promise<{ success: boolean; message: string }> {
  try {
    const currentAmiId = await getCurrentAmiId();

    if (currentAmiId === amiId) {
      logger.info('SSM parameter already contains latest AMI ID', { amiId });
      return { success: true, message: 'Already using latest AMI' };
    }

    if (DRY_RUN) {
      logger.info('Would update SSM parameter', {
        from: currentAmiId,
        to: amiId,
        dryRun: true,
      });
      return { success: true, message: 'Would update AMI (Dry Run)' };
    }

    const command = new PutParameterCommand({
      Name: SSM_PARAMETER_NAME,
      Value: amiId,
      Type: 'String',
      Overwrite: true,
    });

    await ssmClient.send(command);

    logger.info('Successfully updated SSM parameter', {
      from: currentAmiId,
      to: amiId,
    });
    return { success: true, message: 'Updated successfully' };
  } catch (error) {
    logger.error('Error updating SSM parameter', { error });
    return { success: false, message: `Error: ${error}` };
  }
}

export const handler = async (event: any, context: any) => {
  logger.info('Starting AMI updater', { dryRun: DRY_RUN });

  try {
    // Get the latest AMI
    const latestAmi = await getLatestAmi();
    logger.info('Found latest AMI', { amiId: latestAmi.ImageId });

    if (!latestAmi.ImageId) {
      throw new Error('Latest AMI ID is undefined');
    }

    // Update SSM parameter
    const { success, message } = await updateAmiParameter(latestAmi.ImageId);

    return {
      statusCode: success ? 200 : 500,
      body: {
        dryRun: DRY_RUN,
        overallSuccess: success,
        latestAmi: latestAmi.ImageId,
        message: DRY_RUN ? `[DRY RUN] ${message}` : message,
      },
    };
  } catch (error) {
    logger.error('Error in lambda execution', { error });
    return {
      statusCode: 500,
      body: {
        dryRun: DRY_RUN,
        error: String(error),
        overallSuccess: false,
      },
    };
  }
};