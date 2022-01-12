import { Context, SQSEvent } from 'aws-lambda';
import 'source-map-support/register';

import { LogFields, logger } from './logger';
import { PoolEvent, adjust } from './pool/pool';
import ScaleError from './scale-runners/ScaleError';
import { scaleDown } from './scale-runners/scale-down';
import { scaleUp } from './scale-runners/scale-up';

export async function scaleUpHandler(event: SQSEvent, context: Context): Promise<void> {
  logger.setSettings({ requestId: context.awsRequestId });
  logger.debug(JSON.stringify(event));
  if (event.Records.length !== 1) {
    logger.warn(
      'Event ignored, only one record at the time can be handled, ensure the lambda batch size is set to 1.',
      LogFields.print(),
    );
    return new Promise((resolve) => resolve());
  }

  try {
    await scaleUp(event.Records[0].eventSource, JSON.parse(event.Records[0].body));
  } catch (e) {
    if (e instanceof ScaleError) {
      throw e;
    } else {
      logger.warn(`Ignoring error: ${(e as Error).message}`, LogFields.print());
    }
  }
}

export async function scaleDownHandler(context: Context): Promise<void> {
  logger.setSettings({ requestId: context.awsRequestId });

  try {
    await scaleDown();
  } catch (e) {
    logger.error(e);
  }
}

export async function adjustPool(event: PoolEvent, context: Context): Promise<void> {
  logger.setSettings({ requestId: context.awsRequestId });

  try {
    await adjust(event);
  } catch (e) {
    logger.error(e);
  }
}
