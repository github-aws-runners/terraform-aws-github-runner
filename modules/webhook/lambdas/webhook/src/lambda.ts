import { APIGatewayEvent, Context } from 'aws-lambda';

import { handle } from './webhook/handler';
import { logger } from './webhook/logger';

export interface Response {
  statusCode: number;
  body?: string;
}
export async function githubWebhook(event: APIGatewayEvent, context: Context): Promise<Response> {
  logger.setSettings({ requestId: context.awsRequestId });
  logger.debug(JSON.stringify(event));
  let result: Response;
  try {
    result = await handle(event.headers, event.body as string);
  } catch (e) {
    logger.error(e);
    result = {
      statusCode: 500,
      body: 'Check the Lambda logs for the error details.',
    };
  }
  return result;
}
