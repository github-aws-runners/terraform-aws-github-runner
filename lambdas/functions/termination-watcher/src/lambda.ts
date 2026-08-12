import middy from '@middy/core';
import { captureLambdaHandler, logger, metrics, setContext, tracer } from '@aws-github-runner/aws-powertools-util';
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware';
import { Context, SQSEvent } from 'aws-lambda';

import { handle as handleTerminationWarning } from './termination-warning';
import { handle as handleTermination } from './termination';
import { handleDeregisterRetry, DeregisterRetryMessage } from './deregister';
import { BidEvictedDetail, BidEvictedEvent, SpotInterruptionWarning, SpotTerminationDetail } from './types';
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

export async function termination(event: BidEvictedEvent<BidEvictedDetail>, context: Context): Promise<void> {
  setContext(context, 'lambda.ts');
  logger.logEventIfEnabled(event);
  logger.debug('Configuration of the lambda', { config });

  try {
    await handleTermination(event, config);
  } catch (e) {
    logger.error(`${(e as Error).message}`, { error: e as Error });
  }
}

export async function deregisterRetry(event: SQSEvent, context: Context): Promise<void> {
  setContext(context, 'lambda.ts');
  logger.logEventIfEnabled(event);
  logger.debug('Processing SQS deregister retry batch', { recordCount: event.Records.length });

  const queueUrl = process.env.DEREGISTER_RETRY_QUEUE_URL;
  if (!queueUrl) {
    logger.error('DEREGISTER_RETRY_QUEUE_URL is not set — cannot process retry messages');
    return;
  }

  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body) as DeregisterRetryMessage;
      await handleDeregisterRetry(queueUrl, message);
    } catch (e) {
      logger.error(`Failed to process SQS record ${record.messageId}`, { error: e as Error });
      // Re-throw to mark the message as failed so SQS can retry or route to DLQ
      throw e;
    }
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
