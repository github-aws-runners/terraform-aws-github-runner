import { scaleUp as scaleUpAction } from './scale-runners/scale-up';
import { scaleDown as scaleDownAction } from './scale-runners/scale-down';
import { SQSEvent, ScheduledEvent, Context } from 'aws-lambda';

export const scaleUp = async (event: SQSEvent, context: Context, callback: any): Promise<void> => {
  console.dir(event, { depth: 5 });
  try {
    for (const e of event.Records) {
      await scaleUpAction(e.eventSource, JSON.parse(e.body));
    }

    callback(null);
  } catch (e) {
    console.error(e);
    callback('Failed handling SQS event');
  }
};

export const scaleDown = async (event: ScheduledEvent, context: Context, callback: any): Promise<void> => {
  try {
    await scaleDownAction();
    callback(null);
  } catch (e) {
    console.error(e);
    callback('Failed');
  }
};
