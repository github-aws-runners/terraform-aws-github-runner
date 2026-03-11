import middy from '@middy/core';
import type { MiddlewareObj } from '@middy/core';
import { captureLambdaHandler, logger, metrics, setContext, tracer } from '@aws-github-runner/aws-powertools-util';
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware';
import { Context } from 'aws-lambda';

import { handle as handleTerminationWarning } from './termination-warning';
import { handle as handleTermination } from './termination';
import { BidEvictedDetail, BidEvictedEvent, SpotInterruptionWarning, SpotTerminationDetail } from './types';
import { Config } from './ConfigResolver';

// Type assertion helper for AWS PowerTools middleware compatibility with Middy v7
const asMiddleware = <TEvent, TResult>(
  middleware: ReturnType<typeof captureLambdaHandler> | ReturnType<typeof logMetrics>,
): MiddlewareObj<TEvent, TResult, Error, Context> => middleware as MiddlewareObj<TEvent, TResult, Error, Context>;

const config = new Config();

async function handleInterruptionWarning(
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

async function handleBidEvicted(event: BidEvictedEvent<BidEvictedDetail>, context: Context): Promise<void> {
  setContext(context, 'lambda.ts');
  logger.logEventIfEnabled(event);
  logger.debug('Configuration of the lambda', { config });

  try {
    await handleTermination(event, config);
  } catch (e) {
    logger.error(`${(e as Error).message}`, { error: e as Error });
  }
}

// Export handlers with AWS PowerTools middleware
const tracingMiddleware = captureLambdaHandler(tracer);
const metricsMiddleware = logMetrics(metrics);

const interruptionWarningHandler = middy(handleInterruptionWarning);
if (tracingMiddleware) {
  logger.debug('Adding captureLambdaHandler middleware');
  interruptionWarningHandler.use(asMiddleware<SpotInterruptionWarning<SpotTerminationDetail>, void>(tracingMiddleware));
}
if (metricsMiddleware) {
  logger.debug('Adding logMetrics middleware');
  interruptionWarningHandler.use(asMiddleware<SpotInterruptionWarning<SpotTerminationDetail>, void>(metricsMiddleware));
}

export const interruptionWarning = interruptionWarningHandler;
export const termination = handleBidEvicted;
