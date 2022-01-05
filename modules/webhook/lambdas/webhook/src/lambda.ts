import { handle } from './webhook/handler';
import { APIGatewayEvent, Context, Callback } from 'aws-lambda';
import { logger } from './webhook/logger';

export interface Response {
  statusCode: number;
  body?: string;
}
export async function githubWebhook(event: APIGatewayEvent, context: Context): Promise<void> {
  logger.setSettings({ requestId: context.awsRequestId });
  logger.debug(JSON.stringify(event));
  try {
    await handle(event.headers, event.body as string);
  } catch (e) {
    logger.error(e);
  }
}
