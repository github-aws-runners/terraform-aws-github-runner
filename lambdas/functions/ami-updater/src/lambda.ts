import { EC2Client } from '@aws-sdk/client-ec2';
import { logger, metrics } from '@aws-github-runner/aws-powertools-util';
import { Context } from 'aws-lambda';
import { AMIManager } from './ami';
import { getConfig } from './config';

const ec2Client = new EC2Client({});
const amiManager = new AMIManager(ec2Client);

export const handler = async (_event: any, context: Context): Promise<void> => {
  try {
    logger.addContext(context);
    const config = getConfig();

    logger.info('Starting AMI update process', { config });

    const latestAmiId = await amiManager.getLatestAmi(config.amiFilter);
    logger.info('Found latest AMI', { amiId: latestAmiId });

    const result = await amiManager.updateLaunchTemplate(config.launchTemplateName, latestAmiId, config.dryRun);

    if (result.success) {
      logger.info('AMI update completed successfully', { result });
    } else {
      logger.error('AMI update failed', { result });
      throw new Error(result.message);
    }
  } catch (error) {
    logger.error('Error in AMI update process', { error });
    throw error;
  }
};
