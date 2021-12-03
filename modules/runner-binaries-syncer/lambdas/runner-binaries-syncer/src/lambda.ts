import { sync } from './syncer/syncer';
import { logger } from './syncer/logger';

// eslint-disable-next-line
export const handler = async (event: any, context: any): Promise<void> => {
  logger.setSettings({ requestId: context.awsRequestId });
  logger.debug(JSON.stringify(event));

  return new Promise((resolve) => {
    sync()
      .then(() => resolve())
      .catch((e: Error) => {
        logger.warn('Ignoring error:', e);
        resolve();
      });
  });
};
