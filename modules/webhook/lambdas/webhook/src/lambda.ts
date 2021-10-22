import { handle } from './webhook/handler';
import { APIGatewayEvent, Context, Callback } from 'aws-lambda';
import { logger } from './webhook/logger';

export const githubWebhook = async (event: APIGatewayEvent, context: Context, callback: Callback): Promise<void> => {
  logger.setSettings({ requestId: context.awsRequestId });
  logger.debug(JSON.stringify(event));
  try {
    const statusCode = await handle(event.headers, event.body as string);
    callback(null, {
      statusCode: statusCode,
    });
  } catch (e) {
    callback(e as Error);
  }
};
