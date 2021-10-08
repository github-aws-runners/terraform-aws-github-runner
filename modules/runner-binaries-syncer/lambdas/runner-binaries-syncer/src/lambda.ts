import { handle } from './syncer/handler';
import { Logger } from 'tslog';

const rootLogger = new Logger({
  colorizePrettyLogs: false,
  displayInstanceName: false,
  minLevel: process.env.LOG_LEVEL || 'info',
  name: 'runner-binaries-syncer',
  overwriteConsole: true,
  type: process.env.LOG_TYPE || 'pretty',
});

// eslint-disable-next-line
export const handler = async (event: any, context: any, callback: any): Promise<void> => {
  rootLogger.setSettings({ requestId: context.awsRequestId });
  rootLogger.debug(JSON.stringify(event));
  try {
    await handle();
    callback(null);
  } catch (e) {
    callback(e);
  }
};
