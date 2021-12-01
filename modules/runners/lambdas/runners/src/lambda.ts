import { scaleUp } from './scale-runners/scale-up';
import { scaleDown } from './scale-runners/scale-down';
import { SQSEvent, ScheduledEvent, Context, Callback } from 'aws-lambda';
import { logger } from './scale-runners/logger';
import ScaleError from './scale-runners/ScaleError';
import 'source-map-support/register';

export async function scaleUpHandler(event: SQSEvent, context: Context): Promise<void> {
  logger.setSettings({ requestId: context.awsRequestId });
  logger.debug(JSON.stringify(event));
  if (event.Records.length != 1) {
    logger.warn('Event ignored, only on record at the time can be handled, ensure the lambda batch size is set to 1.');
    return new Promise((resolve) => resolve());
  }

  return new Promise((resolve, reject) => {
    scaleUp(event.Records[0].eventSource, JSON.parse(event.Records[0].body))
      .then(() => resolve())
      .catch((e: Error) => {
        if (e instanceof ScaleError) {
          reject(e);
        } else {
          logger.warn('Ignoring error: ', e);
        }
      });
  });
}

export async function scaleDownHandler(event: ScheduledEvent, context: Context): Promise<void> {
  logger.setSettings({ requestId: context.awsRequestId });

  return new Promise((resolve) => {
    scaleDown()
      .then(() => resolve())
      .catch((e) => {
        logger.error(e);
        resolve();
      });
  });
}
