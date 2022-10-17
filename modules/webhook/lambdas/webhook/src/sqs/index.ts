import { SQS } from 'aws-sdk';
import { bool } from 'aws-sdk/clients/signer';

import { LogFields, logger } from '../webhook/logger';

export interface ActionRequestMessage {
  id: number;
  eventType: string;
  repositoryName: string;
  repositoryOwner: string;
  installationId: number;
  queueId: string;
  queueFifo: bool;
}

export interface MatcherConfig {
  labelMatchers: string[];
  exactMatch: bool;
}
export interface QueueConfig {
  matcherConfig: MatcherConfig;
  id: string;
  arn: string;
  fifo: bool;
}

export const sendActionRequest = async (message: ActionRequestMessage): Promise<void> => {
  const sqs = new SQS({ region: process.env.AWS_REGION });

  const sqsMessage: SQS.Types.SendMessageRequest = {
    QueueUrl: message.queueId,
    MessageBody: JSON.stringify(message),
  };

  logger.debug(`sending message to SQS: ${JSON.stringify(sqsMessage)}`, LogFields.print());
  if (message.queueFifo) {
    sqsMessage.MessageGroupId = String(message.id);
  }

  await sqs.sendMessage(sqsMessage).promise();
};
