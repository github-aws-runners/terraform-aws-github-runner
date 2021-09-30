import { handle } from './webhook/handler';
import { APIGatewayEvent, Context, Callback } from 'aws-lambda';
import { Logger } from 'tslog';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const githubWebhook = async (event: APIGatewayEvent, context: Context, callback: Callback): Promise<void> => {
  const logger = new Logger({
    name: 'webhook',
    requestId: context.awsRequestId,
    overwriteConsole: true,
    type: process.env.LOG_TYPE || 'pretty',
    displayInstanceName: false,
  });
  logger.debug(JSON.stringify(event));
  try {
    const statusCode = await handle(event.headers, event.body);
    callback(null, {
      statusCode: statusCode,
    });
  } catch (e) {
    callback(e);
  }
};
