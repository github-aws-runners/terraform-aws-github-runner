import { handle } from './webhook/handler';

export const githubWebhook = async (event: any, context: any, callback: any): Promise<void> => {
  const statusCode = await handle(event.headers, event.body);
  callback(null, {
    statusCode: statusCode,
  });
};
