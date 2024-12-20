import { SQSClient, SendMessageCommand, SendMessageCommandOutput } from '@aws-sdk/client-sqs';
import { logger } from '@aws-github-runner/aws-powertools-util';

const sqs = new SQSClient({});

/**
 * Function to publish message to SQS all errors are logged and not thrown.
 *
 * @param message Message to be published to SQS
 * @param queueUrlEnvironmentKey Configuration key for queue URL
 */
export async function publishMessage(message: string, queueUrl: string, delayInSeconds?: number): Promise<void> {
  if (!queueUrl) {
    logger.error(`Queue URL not found, skipping publishing message to SQS.`);
    return;
  }

  const messageCommand = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: message,
    DelaySeconds: delayInSeconds,
  });

  try {
    const result: SendMessageCommandOutput = await sqs.send(messageCommand);

    logger.debug(`message '${result.MessageId}' published to SQS to queue: ${queueUrl}`, {
      command: messageCommand,
      result: result,
    });
  } catch (e) {
    logger.error(`Error publishing message to SQS.`, {
      command: messageCommand,
      error: e,
    });
  }
}
