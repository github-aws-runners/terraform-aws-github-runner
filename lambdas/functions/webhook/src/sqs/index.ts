import { SQS, SendMessageCommandInput } from '@aws-sdk/client-sqs';
import { WorkflowJobEvent } from '@octokit/webhooks-types';
import { createChildLogger, getTracedAWSV3Client } from '@aws-github-runner/aws-powertools-util';

const logger = createChildLogger('sqs');

export interface ActionRequestMessage {
  id: number;
  eventType: string;
  repositoryName: string;
  repositoryOwner: string;
  installationId: number;
  queueId: string;
  repoOwnerType: string;
}

export interface MatcherConfig {
  labelMatchers: string[][];
  exactMatch: boolean;
}

export type RunnerConfig = RunnerMatcherConfig[];

export interface RunnerMatcherConfig {
  matcherConfig: MatcherConfig;
  id: string;
  arn: string;
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

  await sqs.sendMessage(sqsMessage);
};
