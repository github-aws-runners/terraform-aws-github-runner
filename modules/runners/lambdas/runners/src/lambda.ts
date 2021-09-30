import { scaleUp as scaleUpAction } from './scale-runners/scale-up';
import { scaleDown as scaleDownAction } from './scale-runners/scale-down';
import { SQSEvent, ScheduledEvent, Context, Callback } from 'aws-lambda';
import { Logger } from 'tslog';
import 'source-map-support/register';

export const scaleUp = async (event: SQSEvent, context: Context, callback: Callback): Promise<void> => {
  const logger = new Logger({
    name: 'scale-up',
    requestId: context.awsRequestId,
    overwriteConsole: true,
    type: process.env.LOG_TYPE || 'pretty',
    displayInstanceName: false,
  });
  logger.debug(JSON.stringify(event));
  try {
    for (const e of event.Records) {
      await scaleUpAction(e.eventSource, JSON.parse(e.body));
    }

    callback(null);
  } catch (e) {
    logger.error(e);
    callback('Failed handling SQS event');
  }
};

export const scaleDown = async (event: ScheduledEvent, context: Context, callback: Callback): Promise<void> => {
  const logger = new Logger({
    name: 'scale-down',
    overwriteConsole: true,
    type: process.env.LOG_TYPE || 'pretty',
    displayInstanceName: false,
  });
  try {
    await scaleDownAction();
    callback(null);
  } catch (e) {
    logger.error(e);
    callback('Failed');
  }
};
