import { handle as githubWebhook } from './webhook/handler';

module.exports.githubWebhook = async (event: any, context: any, callback: any) => {
  console.log('hello');
  const statusCode = await githubWebhook(event.headers, event.body);
  return callback(null, {
    statusCode: statusCode,
  });
};
