import { SQS, SendMessageCommandInput } from '@aws-sdk/client-sqs';
import { WorkflowJobEvent } from '@octokit/webhooks-types';
import { createChildLogger, getTracedAWSV3Client } from '@aws-github-runner/aws-powertools-util';

const logger = createChildLogger('sqs');

const sqsClientsByRegion = new Map<string, SQS>();

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
  const region = getRegionFromQueueUrl(message.queueId) ?? process.env.AWS_REGION;
  const sqs = getSqsClient(region);

  const sqsMessage: SendMessageCommandInput = {
    QueueUrl: message.queueId,
    MessageBody: JSON.stringify(message),
  };

  logger.debug(`sending message to SQS: ${JSON.stringify(sqsMessage)}`);

  await sqs.sendMessage(sqsMessage);
};

function getSqsClient(region: string | undefined): SQS {
  if (!region) {
    return getTracedAWSV3Client(new SQS({}));
  }

  const cached = sqsClientsByRegion.get(region);
  if (cached) {
    return cached;
  }

  const client = getTracedAWSV3Client(new SQS({ region }));
  sqsClientsByRegion.set(region, client);
  return client;
}

function getRegionFromQueueUrl(queueUrl: string): string | undefined {
  try {
    const url = new URL(queueUrl);
    const parts = url.hostname.split('.');
    if (parts.length >= 3 && parts[0] === 'sqs') {
      return parts[1];
    }
  } catch {}

  return undefined;
}
