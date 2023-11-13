import { SQS, SendMessageCommandInput } from '@aws-sdk/client-sqs';
import { WorkflowJobEvent } from '@octokit/webhooks-types';
import { createChildLogger } from '@terraform-aws-github-runner/aws-powertools-util';
import { getTracedAWSV3Client } from '@terraform-aws-github-runner/aws-powertools-util';

const logger = createChildLogger('sqs');

export interface ActionRequestMessage {
  id: number;
  eventType: string;
  repositoryName: string;
  repositoryOwner: string;
  installationId: number;
  queueId: string;
  queueFifo: boolean;
}

export interface MatcherConfig {
  labelMatchers: string[][];
  exactMatch: boolean;
}

export interface QueueConfig {
  matcherConfig: MatcherConfig;
  id: string;
  arn: string;
  fifo: boolean;
}
export interface GithubWorkflowEvent {
  workflowJobEvent: WorkflowJobEvent;
}

export const sendActionRequest = async (message: ActionRequestMessage): Promise<void> => {
  const sqs = getTracedAWSV3Client(new SQS({ region: process.env.AWS_REGION }));

  const sqsMessage: SendMessageCommandInput = {
    QueueUrl: message.queueId,
    MessageBody: JSON.stringify(message),
  };

  logger.debug(`sending message to SQS: ${JSON.stringify(sqsMessage)}`);
  if (message.queueFifo) {
    sqsMessage.MessageGroupId = String(message.id);
  }

  await sqs.sendMessage(sqsMessage);
};

export const sendWebhookEventToWorkflowJobQueue = async (message: GithubWorkflowEvent): Promise<void> => {
  const webhook_events_workflow_job_queue = process.env.SQS_WORKFLOW_JOB_QUEUE || undefined;

  if (webhook_events_workflow_job_queue != undefined) {
    const sqs = new SQS({ region: process.env.AWS_REGION });
    const sqsMessage: SendMessageCommandInput = {
      QueueUrl: String(process.env.SQS_WORKFLOW_JOB_QUEUE),
      MessageBody: JSON.stringify(message),
    };
    logger.debug(`Sending Webhook events to the workflow job queue: ${webhook_events_workflow_job_queue}`);
    try {
      await sqs.sendMessage(sqsMessage);
    } catch (e) {
      logger.warn(`Error in sending webhook events to workflow job queue: ${(e as Error).message}`);
    }
  }
};
