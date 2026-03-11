import middy from '@middy/core';
import type { MiddlewareObj } from '@middy/core';
import { logger, setContext } from '@aws-github-runner/aws-powertools-util';
import { captureLambdaHandler, tracer } from '@aws-github-runner/aws-powertools-util';
import { Context } from 'aws-lambda';

import { sync } from './syncer/syncer';

// Type assertion helper for AWS PowerTools middleware compatibility with Middy v7
const asMiddleware = <TEvent, TResult>(
  middleware: ReturnType<typeof captureLambdaHandler>,
): MiddlewareObj<TEvent, TResult, Error, Context> => middleware as MiddlewareObj<TEvent, TResult, Error, Context>;

// eslint-disable-next-line
async function handleSync(event: any, context: Context): Promise<void> {
  setContext(context, 'lambda.ts');
  logger.logEventIfEnabled(event);

  try {
    await sync();
  } catch (e) {
    if (e instanceof Error) {
      logger.warn(`Ignoring error: ${e.message}`);
    }
    logger.debug('Ignoring error', { error: e });
  }
}

// Export handler with AWS PowerTools middleware
const powertoolsMiddleware = captureLambdaHandler(tracer);
export const handler = powertoolsMiddleware
  ? middy(handleSync).use(asMiddleware<unknown, void>(powertoolsMiddleware))
  : handleSync;
