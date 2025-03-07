import middy from '@middy/core';
import { logger, setContext } from '@aws-github-runner/aws-powertools-util';
import { captureLambdaHandler, tracer } from '@aws-github-runner/aws-powertools-util';
import { Context, SQSEvent } from 'aws-lambda';

import { PoolEvent, adjust } from './pool/pool';
import ScaleError from './scale-runners/ScaleError';
import { scaleDown } from './scale-runners/scale-down';
import { scaleUp } from './scale-runners/scale-up';
import { SSMCleanupOptions, cleanSSMTokens } from './scale-runners/ssm-housekeeper';
import { checkAndRetryJob } from './scale-runners/job-retry';

export async function scaleUpHandler(event: SQSEvent, context: Context): Promise<void> {
  setContext(context, 'lambda.ts');
  logger.logEventIfEnabled(event);

  if (event.Records.length !== 1) {
    logger.warn('Event ignored, only one record at the time can be handled, ensure the lambda batch size is set to 1.');
    return Promise.resolve();
  }

  try {
    await scaleUp(event.Records[0].eventSource, JSON.parse(event.Records[0].body));
    return Promise.resolve();
  } catch (e) {
    if (e instanceof ScaleError) {
      return Promise.reject(e);
    } else {
      logger.warn(`Ignoring error: ${e}`);
      return Promise.resolve();
    }
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
