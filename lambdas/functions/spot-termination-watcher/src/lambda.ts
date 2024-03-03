import middy from '@middy/core';
import {
  captureLambdaHandler,
  logger,
  metrics,
  setContext,
  tracer,
} from '@terraform-aws-github-runner/aws-powertools-util';
import { logMetrics } from '@aws-lambda-powertools/metrics';
import { Context } from 'aws-lambda';

import { handle as handleTerminationWarning } from './termination-warning';
import { SpotInterruptionWarning, SpotTerminationDetail } from './types';
import { Config } from './ConfigResolver';

const config = new Config();

export async function interruptionWarning(
  event: SpotInterruptionWarning<SpotTerminationDetail>,
  context: Context,
): Promise<void> {
  setContext(context, 'lambda.ts');
  logger.logEventIfEnabled(event);
  logger.debug('Configuration of the lambda', { config });

  try {
    await handleTerminationWarning(event, config);
  } catch (e) {
    logger.error(`${(e as Error).message}`, { error: e as Error });
  }
}

//middy(interruptionWarning).use(captureLambdaHandler(tracer)).use(logMetrics(metrics));

export const addMiddleware = () => {
  const handler = captureLambdaHandler(tracer);
  // handler check needed for testing.
  if (!handler) {
    middy(interruptionWarning).use(logMetrics(metrics));
    return;
  }
  middy(interruptionWarning).use(captureLambdaHandler(tracer)).use(logMetrics(metrics));
};
addMiddleware();
