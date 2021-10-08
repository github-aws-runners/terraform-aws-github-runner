import { scaleUp as scaleUpAction } from './scale-runners/scale-up';
import { scaleDown as scaleDownAction } from './scale-runners/scale-down';
import { SQSEvent, ScheduledEvent, Context, Callback } from 'aws-lambda';
import { Logger } from 'tslog';
import 'source-map-support/register';

export const rootLogger = new Logger({
  colorizePrettyLogs: false,
  displayInstanceName: false,
  maskAnyRegEx: ['--token [A-Z0-9]*'],
  minLevel: process.env.LOG_LEVEL || 'info',
  name: 'scale-up',
  overwriteConsole: true,
  type: process.env.LOG_TYPE || 'pretty',
});

export const scaleUp = async (event: SQSEvent, context: Context, callback: Callback): Promise<void> => {
  rootLogger.setSettings({ requestId: context.awsRequestId });
  rootLogger.debug(JSON.stringify(event));
  try {
    for (const e of event.Records) {
      await scaleUpAction(e.eventSource, JSON.parse(e.body));
    }

    callback(null);
  } catch (e) {
    rootLogger.error(e);
    callback('Failed handling SQS event');
  }
};

export const scaleDown = async (event: ScheduledEvent, context: Context, callback: Callback): Promise<void> => {
  rootLogger.setSettings({ requestId: context.awsRequestId });
  try {
    await scaleDownAction();
    callback(null);
  } catch (e) {
    rootLogger.error(e);
    callback('Failed');
  }
};
