import { WorkflowJobEvent } from '@octokit/webhooks-types';
import { SQS } from 'aws-sdk';

import { LogFields, logger } from '../webhook/logger';

export interface ActionRequestMessage {
  id: number;
  eventType: string;
  repositoryName: string;
  repositoryOwner: string;
  installationId: number;
}
export interface GithubWorkflowEvent {
  id: number;
  eventType: string;
  jobEvent: WorkflowJobEvent;
}

export const sendActionRequest = async (message: ActionRequestMessage): Promise<void> => {
  const sqs = new SQS({ region: process.env.AWS_REGION });

  const useFifoQueueEnv = process.env.SQS_IS_FIFO || 'false';
  const useFifoQueue = JSON.parse(useFifoQueueEnv) as boolean;

  const sqsMessage: SQS.Types.SendMessageRequest = {
    QueueUrl: String(process.env.SQS_URL_WEBHOOK),
    MessageBody: JSON.stringify(message),
  };

  logger.debug(`sending message to SQS: ${JSON.stringify(sqsMessage)}`, LogFields.print());
  if (useFifoQueue) {
    sqsMessage.MessageGroupId = String(message.id);
  }

  await sqs.sendMessage(sqsMessage).promise();
};

export const sendWebhookEventToSecondaryQueue = async (message: GithubWorkflowEvent): Promise<void> => {
  const webhook_events_secondary_queue = process.env.SQS_SECONDARY_QUEUE || 'empty';

  logger.debug(`Webhook events secondary queue: ${webhook_events_secondary_queue}`, LogFields.print());

  if (webhook_events_secondary_queue != 'empty') {
    const sqs = new SQS({ region: process.env.AWS_REGION });
    const sqsMessage: SQS.Types.SendMessageRequest = {
      QueueUrl: String(process.env.SQS_SECONDARY_QUEUE),
      MessageBody: JSON.stringify(message),
    };
    logger.debug(`Sending Webhook events to the secondary queue: ${webhook_events_secondary_queue}`, LogFields.print());
    try {
      await sqs.sendMessage(sqsMessage).promise();
    } catch (e) {
      logger.warn(`Error in sending webhook events to secondary queue: ${(e as Error).message}`, LogFields.print());
    }
  }
};
