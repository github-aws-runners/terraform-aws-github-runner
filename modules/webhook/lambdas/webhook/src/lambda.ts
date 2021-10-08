import { handle } from './webhook/handler';
import { APIGatewayEvent, Context, Callback } from 'aws-lambda';
import { Logger } from 'tslog';

export const rootLogger = new Logger({
  colorizePrettyLogs: false,
  displayInstanceName: false,
  minLevel: process.env.LOG_LEVEL || 'info',
  name: 'webhook',
  overwriteConsole: true,
  type: process.env.LOG_TYPE || 'pretty',
});

export const githubWebhook = async (event: APIGatewayEvent, context: Context, callback: Callback): Promise<void> => {
  rootLogger.setSettings({ requestId: context.awsRequestId });
  rootLogger.debug(JSON.stringify(event));
  try {
    const statusCode = await handle(event.headers, event.body);
    callback(null, {
      statusCode: statusCode,
    });
  } catch (e) {
    callback(e as Error);
  }
};
