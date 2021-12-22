import { SQS } from 'aws-sdk';
import { LogFields, logger as logger } from '../webhook/logger';

export interface ActionRequestMessage {
  id: number;
  eventType: string;
  repositoryName: string;
  repositoryOwner: string;
  installationId: number;
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
