import { handle } from './syncer/handler';
import { Logger } from 'tslog';

// eslint-disable-next-line
export const handler = async (event: any, context: any, callback: any): Promise<void> => {
  const logger = new Logger({
    name: 'runner-binaries-syncer',
    requestId: context.awsRequestId,
    overwriteConsole: true,
    type: process.env.LOG_TYPE || 'pretty',
    displayInstanceName: false,
  });
  logger.debug(JSON.stringify(event));
  try {
    await handle();
    callback(null);
  } catch (e) {
    callback(e);
  }
};
