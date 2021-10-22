import { scaleUp } from './scale-runners/scale-up';
import { scaleDown } from './scale-runners/scale-down';
import { SQSEvent, ScheduledEvent, Context, Callback } from 'aws-lambda';
import { logger } from './scale-runners/logger';
import 'source-map-support/register';

export async function scaleUpHandler(event: SQSEvent, context: Context, callback: Callback): Promise<void> {
  logger.setSettings({ requestId: context.awsRequestId });
  logger.debug(JSON.stringify(event));
  try {
    for (const e of event.Records) {
      await scaleUp(e.eventSource, JSON.parse(e.body));
    }

    callback(null);
  } catch (e) {
    logger.error(e);
    callback('Failed handling SQS event');
  }
}

export async function scaleDownHandler(event: ScheduledEvent, context: Context, callback: Callback): Promise<void> {
  logger.setSettings({ requestId: context.awsRequestId });
  try {
    await scaleDown();
    callback(null);
  } catch (e) {
    logger.error(e);
    callback('Failed');
  }
}
