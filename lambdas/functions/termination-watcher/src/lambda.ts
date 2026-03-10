import middy from '@middy/core';
import { captureLambdaHandler, logger, metrics, setContext, tracer } from '@aws-github-runner/aws-powertools-util';
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware';
import { Context } from 'aws-lambda';

import { handle as handleTerminationWarning } from './termination-warning';
import { handle as handleTermination } from './termination';
import { BidEvictedDetail, BidEvictedEvent, SpotInterruptionWarning, SpotTerminationDetail } from './types';
import { Config } from './ConfigResolver';

const config = new Config();

async function interruptionWarningFn(
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

async function terminationFn(event: BidEvictedEvent<BidEvictedDetail>, context: Context): Promise<void> {
  setContext(context, 'lambda.ts');
  logger.logEventIfEnabled(event);
  logger.debug('Configuration of the lambda', { config });

  try {
    await handleTermination(event, config);
  } catch (e) {
    logger.error(`${(e as Error).message}`, { error: e as Error });
  }
}

// Export wrapped handlers for middy v7
const c = captureLambdaHandler(tracer);
const l = logMetrics(metrics);

export const interruptionWarning = middy(interruptionWarningFn);
if (c) {
  logger.debug('Adding captureLambdaHandler middleware');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interruptionWarning.use(c as any);
}
if (l) {
  logger.debug('Adding logMetrics middleware');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interruptionWarning.use(l as any);
}

export const termination = terminationFn;
