import { Webhooks } from '@octokit/webhooks';
import { WorkflowJobEvent } from '@octokit/webhooks-types';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { IncomingHttpHeaders } from 'http';

import { Response } from '../lambda';
import { sendWebhookEventToWorkflowJobQueue } from '../sqs';
import ValidationError from '../ValidationError';
import { Config } from '../ConfigResolver';
import { dispatch as dispatch } from '../runners/dispatch';
const supportedEvents = ['workflow_job'];
const logger = createChildLogger('handler');

export async function handle(headers: IncomingHttpHeaders, body: string, config: Config): Promise<Response> {
  init(headers);

  await verifySignature(headers, body);
  const { event, eventType } = readEvent(headers, body);
  logger.info(`Processing Github event ${event.action} for ${event.repository.full_name}`);

  //validateRepoInAllowList(event, config);
  const response = await dispatch(event, eventType, config);
  await sendWebhookEventToWorkflowJobQueue({ workflowJobEvent: event }, config);
  return response;
}

async function verifySignature(headers: IncomingHttpHeaders, body: string): Promise<number> {
  const signature = headers['x-hub-signature-256'] as string;
  const webhooks = new Webhooks({
    secret: Config.webhookSecret!,
  });

  if (
    await webhooks.verify(body, signature).catch((e) => {
      logger.debug('Unable to verify signature!', { e });
      throw new ValidationError(500, 'Unable to verify signature!', e as Error);
    })
  ) {
    return 200;
  } else {
    logger.debug('Unable to verify signature!', { signature, body });
    throw new ValidationError(401, 'Unable to verify signature!');
  }
}

function init(headers: IncomingHttpHeaders) {
  for (const key in headers) {
    headers[key.toLowerCase()] = headers[key];
  }

  logger.addPersistentLogAttributes({
    github: {
      'github-event': headers['x-github-event'],
      'github-delivery': headers['x-github-delivery'],
    },
  });
}

function readEvent(headers: IncomingHttpHeaders, body: string): { event: WorkflowJobEvent; eventType: string } {
  const eventType = headers['x-github-event'] as string;

  if (!supportedEvents.includes(eventType)) {
    logger.warn(`Unsupported event type: ${eventType}`);
    throw new ValidationError(202, `Unsupported event type: ${eventType}`);
  }

  const event = JSON.parse(body) as WorkflowJobEvent;
  logger.addPersistentLogAttributes({
    github: {
      repository: event.repository.full_name,
      action: event.action,
      name: event.workflow_job.name,
      status: event.workflow_job.status,
      workflowJobId: event.workflow_job.id,
      started_at: event.workflow_job.started_at,
      completed_at: event.workflow_job.completed_at,
      conclusion: event.workflow_job.conclusion,
    },
  });

  return { event, eventType };
}
