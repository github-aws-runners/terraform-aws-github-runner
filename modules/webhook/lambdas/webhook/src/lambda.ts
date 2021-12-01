import { handle } from './webhook/handler';
import { APIGatewayEvent, Context, Callback } from 'aws-lambda';
import { logger } from './webhook/logger';

export interface Response {
  statusCode: number;
  body?: string;
}

export const githubWebhook = async (event: APIGatewayEvent, context: Context, callback: Callback): Promise<void> => {
  logger.setSettings({ requestId: context.awsRequestId });
  logger.debug(JSON.stringify(event));
  try {
    const response = await handle(event.headers, event.body as string);
    callback(null, response);
  } catch (e) {
    callback(e as Error);
  }
};
