import middy from '@middy/core';
import { logger, setContext } from '@aws-github-runner/aws-powertools-util';
import { captureLambdaHandler, tracer } from '@aws-github-runner/aws-powertools-util';
import { Context } from 'aws-lambda';

import { sync } from './syncer/syncer';

// eslint-disable-next-line
async function handlerFn(event: any, context: Context): Promise<void> {
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

// Export wrapped handler for middy v7
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handler = middy(handlerFn).use(captureLambdaHandler(tracer) as any);
