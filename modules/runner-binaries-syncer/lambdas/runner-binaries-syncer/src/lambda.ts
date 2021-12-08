import { sync } from './syncer/syncer';
import { logger } from './syncer/logger';

// eslint-disable-next-line
export async function handler(event: any, context: any): Promise<void> {
  logger.setSettings({ requestId: context.awsRequestId });
  logger.debug(JSON.stringify(event));

  try {
    await sync();
  } catch (e) {
    logger.warn('Ignoring error:', e);
  }
}
