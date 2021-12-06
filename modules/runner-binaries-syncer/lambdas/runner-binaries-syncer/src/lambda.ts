import { sync } from './syncer/syncer';
import { logger } from './syncer/logger';

// eslint-disable-next-line
export async function handler(event: any, context: any, callback: any): Promise<void> {
  logger.setSettings({ requestId: context.awsRequestId });
  logger.debug(JSON.stringify(event));

  try {
    await sync();
    callback(null);
  } catch (e) {
    logger.warn('Ignoring error:', e);
    callback(e);
  }
}
