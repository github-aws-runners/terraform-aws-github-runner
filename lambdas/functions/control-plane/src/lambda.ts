import middy from '@middy/core';
import { logger, setContext } from '@aws-github-runner/aws-powertools-util';
import { captureLambdaHandler, tracer } from '@aws-github-runner/aws-powertools-util';
import { Context, type SQSBatchItemFailure, type SQSBatchResponse, SQSEvent } from 'aws-lambda';

import { PoolEvent, adjust } from './pool/pool';
import ScaleError from './scale-runners/ScaleError';
import { scaleDown } from './scale-runners/scale-down';
import { type ActionRequestMessage, type ActionRequestMessageSQS, scaleUp } from './scale-runners/scale-up';
import { SSMCleanupOptions, cleanSSMTokens } from './scale-runners/ssm-housekeeper';
import { checkAndRetryJob } from './scale-runners/job-retry';

export async function scaleUpHandler(event: SQSEvent, context: Context): Promise<SQSBatchResponse> {
  setContext(context, 'lambda.ts');
  logger.logEventIfEnabled(event);

  const sqsMessages: ActionRequestMessageSQS[] = [];
  const warnedEventSources = new Set<string>();

  for (const { body, eventSource, messageId } of event.Records) {
    if (eventSource !== 'aws:sqs') {
      if (!warnedEventSources.has(eventSource)) {
        logger.warn('Ignoring non-sqs event source', { eventSource });
        warnedEventSources.add(eventSource);
      }

      continue;
    }

    const payload = JSON.parse(body) as ActionRequestMessage;
    sqsMessages.push({ ...payload, messageId });
  }

  // Sort messages by their retry count, so that we retry the same messages if
  // there's a persistent failure. This should cause messages to be dropped
  // quicker than if we retried in an arbitrary order.
  sqsMessages.sort((l, r) => {
    return (l.retryCounter ?? 0) - (r.retryCounter ?? 0);
  });

  const batchItemFailures: SQSBatchItemFailure[] = [];

  try {
    const rejectedMessageIds = await scaleUp(sqsMessages);

    for (const messageId of rejectedMessageIds) {
      batchItemFailures.push({
        itemIdentifier: messageId,
      });
    }

    return { batchItemFailures };
  } catch (e) {
    if (e instanceof ScaleError) {
      batchItemFailures.push(...e.toBatchItemFailures(sqsMessages));
      logger.warn(`${e.detailedMessage} A retry will be attempted via SQS.`, { error: e });
    } else {
      logger.error(`Error processing batch (size: ${sqsMessages.length}): ${(e as Error).message}, ignoring batch`, {
        error: e,
      });
    }

    return { batchItemFailures };
  }
}

export async function scaleDownHandler(event: unknown, context: Context): Promise<void> {
  setContext(context, 'lambda.ts');
  logger.logEventIfEnabled(event);

  try {
    await scaleDown();
  } catch (e) {
    logger.error(`${(e as Error).message}`, { error: e as Error });
  }
}

export async function adjustPool(event: PoolEvent, context: Context): Promise<void> {
  setContext(context, 'lambda.ts');
  logger.logEventIfEnabled(event);

  try {
    await adjust(event);
  } catch (e) {
    logger.error(`Handle error for adjusting pool. ${(e as Error).message}`, { error: e as Error });
  }
  return Promise.resolve();
}

export const addMiddleware = () => {
  const handler = captureLambdaHandler(tracer);
  if (!handler) {
    return;
  }
  middy(scaleUpHandler).use(handler);
  middy(scaleDownHandler).use(handler);
  middy(adjustPool).use(handler);
  middy(ssmHousekeeper).use(handler);
};
addMiddleware();

export async function ssmHousekeeper(event: unknown, context: Context): Promise<void> {
  setContext(context, 'lambda.ts');
  logger.logEventIfEnabled(event);
  const config = JSON.parse(process.env.SSM_CLEANUP_CONFIG) as SSMCleanupOptions;

  try {
    await cleanSSMTokens(config);
  } catch (e) {
    logger.error(`${(e as Error).message}`, { error: e as Error });
  }
}

export async function jobRetryCheck(event: SQSEvent, context: Context): Promise<void> {
  setContext(context, 'lambda.ts');
  logger.logEventIfEnabled(event);

  for (const record of event.Records) {
    const payload = JSON.parse(record.body);
    await checkAndRetryJob(payload).catch((e) => {
      logger.warn(`Error processing job retry: ${e.message}`, { error: e });
    });
  }
  return Promise.resolve();
}
