import middy from '@middy/core';
import { logger, setContext, captureLambdaHandler, tracer } from '@terraform-aws-github-runner/aws-powertools-util';
import { APIGatewayEvent, Context } from 'aws-lambda';

import { handle } from './webhook';
import { Config } from './ConfigResolver';
import { IncomingHttpHeaders } from 'http';
import ValidationError from './ValidatonError';

export interface Response {
  statusCode: number;
  body?: string;
}

middy(githubWebhook).use(captureLambdaHandler(tracer));

export async function githubWebhook(event: APIGatewayEvent, context: Context): Promise<Response> {
  setContext(context, 'lambda.ts');
  const config = await Config.load();

  logger.logEventIfEnabled(event);
  logger.debug('Loading config', { config });

  let result: Response;
  try {
    result = await handle(headersToLowerCase(event.headers), event.body as string, config);
  } catch (e) {
    logger.error(`Failed to handle webhook event`, { error: e });
    if (e instanceof ValidationError) {
      result = {
        statusCode: e.statusCode,
        body: e.message,
      };
    } else {
      result = {
        statusCode: 500,
        body: 'Check the Lambda logs for the error details.',
      };
    }
  }
  return result;
}

// ensure header keys lower case since github headers can contain capitals.
function headersToLowerCase(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  for (const key in headers) {
    headers[key.toLowerCase()] = headers[key];
  }
  return headers;
}
