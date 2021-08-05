import { handle } from './webhook/handler';
import { APIGatewayEvent, Context } from 'aws-lambda';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const githubWebhook = async (event: APIGatewayEvent, context: Context, callback: any): Promise<void> => {
  const statusCode = await handle(event.headers, event.body);
  callback(null, {
    statusCode: statusCode,
  });
};
