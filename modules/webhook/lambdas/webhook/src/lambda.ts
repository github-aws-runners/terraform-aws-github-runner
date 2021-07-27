import { handle as githubWebhook } from './webhook/handler';
import { APIGatewayEvent, Context } from 'aws-lambda';

export const githubWebhook = async (event: any, context: any, callback: any): Promise<void> => {
  const statusCode = await handle(event.headers, event.body);
  callback(null, {
    statusCode: statusCode,
  });
};
