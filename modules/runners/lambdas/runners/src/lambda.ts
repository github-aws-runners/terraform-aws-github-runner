import { scaleUp } from './scale-runners/scale-up';
import { scaleDown } from './scale-runners/scale-down';
import { SQSEvent, ScheduledEvent, Context, Callback } from 'aws-lambda';
import { LogFields, logger } from './scale-runners/logger';
import ScaleError from './scale-runners/ScaleError';
import 'source-map-support/register';

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

export async function scaleDownHandler(event: ScheduledEvent, context: Context): Promise<void> {
  logger.setSettings({ requestId: context.awsRequestId });

  try {
    await scaleDown();
  } catch (e) {
    logger.error(e);
  }
}
