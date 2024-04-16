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

const addMiddleware = () => {
  const middleware = middy(interruptionWarning);

  const c = captureLambdaHandler(tracer);
  if (c) {
    logger.debug('Adding captureLambdaHandler middleware');
    middleware.use(c);
  }

  const l = logMetrics(metrics);
  if (l) {
    logger.debug('Adding logMetrics middleware');
    middleware.use(l);
  }
};

addMiddleware();
