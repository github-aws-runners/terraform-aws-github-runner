import { handle } from './webhook/handler';
import { APIGatewayEvent, Context, Callback } from 'aws-lambda';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const githubWebhook = async (event: APIGatewayEvent, context: Context, callback: Callback): Promise<void> => {
  try {
    const statusCode = await handle(event.headers, event.body as string);
    callback(null, {
      statusCode: statusCode,
    });
  } catch (e) {
    callback(e as Error);
  }
};
