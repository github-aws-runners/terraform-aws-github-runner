import middy from '@middy/core';
import { logger, setContext } from '@terraform-aws-github-runner/aws-powertools-util';
import { captureLambdaHandler, tracer } from '@terraform-aws-github-runner/aws-powertools-util';
import { APIGatewayEvent, Context } from 'aws-lambda';

import { handle } from './webhook/handler';

export interface Response {
  statusCode: number;
  body?: string;
}
middy(githubWebhook).use(captureLambdaHandler(tracer));
export async function githubWebhook(event: APIGatewayEvent, context: Context): Promise<Response> {
  setContext(context, 'lambda.ts');
  logger.logEventIfEnabled(event);

  let result: Response;
  try {
    result = await handle(event.headers, event.body as string);
  } catch (e) {
    logger.error(`Failed to handle webhook event`, { error: e });
    result = {
      statusCode: 500,
      body: 'Check the Lambda logs for the error details.',
    };
  }
  return result;
}
