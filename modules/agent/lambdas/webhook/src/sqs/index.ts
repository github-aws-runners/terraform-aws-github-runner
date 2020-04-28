import { SQS } from 'aws-sdk';
import AWS from 'aws-sdk';

AWS.config.update({
  region: process.env.AWS_REGION,
});
const sqs = new SQS();

export interface ActionRequestMessage {
  id: string;
  eventType: string;
  repositoryName: string;
  repositoryOwner: string;
  installationId: number;
}

export const sendActionRequest = async (message: ActionRequestMessage) => {
  await sqs
    .sendMessage({
      QueueUrl: String(process.env.WEBHOOK_SQS_URL),
      MessageBody: JSON.stringify(message),
      MessageGroupId: String(message.id),
    })
    .promise();
};
