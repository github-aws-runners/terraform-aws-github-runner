import { handle } from './syncer/handler';
import { logger } from './syncer/logger';

// eslint-disable-next-line
export const handler = async (event: any, context: any, callback: any): Promise<void> => {
  logger.setSettings({ requestId: context.awsRequestId });
  logger.debug(JSON.stringify(event));
  try {
    await handle();
    callback(null);
  } catch (e) {
    callback(e);
  }
};
