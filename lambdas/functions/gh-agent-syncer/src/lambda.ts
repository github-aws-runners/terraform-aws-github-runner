import middy from '@middy/core';
import { logger, setContext } from '@terraform-aws-github-runner/aws-powertools-util';
import { captureLambdaHandler, tracer } from '@terraform-aws-github-runner/aws-powertools-util';
import { Context } from 'aws-lambda';

import { sync } from './syncer/syncer';

middy(handler).use(captureLambdaHandler(tracer));

// eslint-disable-next-line
export async function handler(event: any, context: Context): Promise<void> {
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
