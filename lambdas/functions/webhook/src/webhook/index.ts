import { Webhooks } from '@octokit/webhooks';
import { CheckRunEvent, WorkflowJobEvent } from '@octokit/webhooks-types';
import { createChildLogger } from '@terraform-aws-github-runner/aws-powertools-util';
import { IncomingHttpHeaders } from 'http';

import { Response } from '../lambda';
import { RunnerMatcherConfig, sendActionRequest, sendWebhookEventToWorkflowJobQueue } from '../sqs';
import ValidationError from '../ValidatonError';
import { Config } from '../ConfigResolver';

const supportedEvents = ['workflow_job'];
const logger = createChildLogger('handler');

export async function handle(headers: IncomingHttpHeaders, body: string, config: Config): Promise<Response> {
  init(headers);

  await verifySignature(headers, body);
  const { event, eventType } = readEvent(headers, body);
  logger.info(`Processing Github event ${event.action} for ${event.repository.full_name}`);

  validateRepoInAllowList(event, config);

  const response = await handleWorkflowJob(event, eventType, Config.matcherConfig!);
  await sendWebhookEventToWorkflowJobQueue({ workflowJobEvent: event }, config);
  return response;
}

function validateRepoInAllowList(event: WorkflowJobEvent, config: Config) {
  if (config.repositoryAllowList.length > 0 && !config.repositoryAllowList.includes(event.repository.full_name)) {
    logger.info(`Received event from unauthorized repository ${event.repository.full_name}`);
    throw new ValidationError(403, `Received event from unauthorized repository ${event.repository.full_name}`);
  }
}

async function handleWorkflowJob(
  body: WorkflowJobEvent,
  githubEvent: string,
  matcherConfig: Array<RunnerMatcherConfig>,
): Promise<Response> {
  const installationId = getInstallationId(body);
  if (body.action === 'queued') {
    // sort the queuesConfig by order of matcher config exact match, with all true matches lined up ahead.
    matcherConfig.sort((a, b) => {
      return a.matcherConfig.exactMatch === b.matcherConfig.exactMatch ? 0 : a.matcherConfig.exactMatch ? -1 : 1;
    });
    for (const queue of matcherConfig) {
      if (canRunJob(body.workflow_job.labels, queue.matcherConfig.labelMatchers, queue.matcherConfig.exactMatch)) {
        await sendActionRequest({
          id: body.workflow_job.id,
          repositoryName: body.repository.name,
          repositoryOwner: body.repository.owner.login,
          eventType: githubEvent,
          installationId: installationId,
          queueId: queue.id,
          queueFifo: queue.fifo,
        });
        logger.info(`Successfully queued job for ${body.repository.full_name} to the queue ${queue.id}`);
        return { statusCode: 201 };
      }
    }
    logger.warn(`Received event contains runner labels '${body.workflow_job.labels}' that are not accepted.`);
    return {
      statusCode: 202,
      body: `Received event contains runner labels '${body.workflow_job.labels}' that are not accepted.`,
    };
  }
  return { statusCode: 201 };
}

function getInstallationId(body: WorkflowJobEvent | CheckRunEvent) {
  return body.installation?.id ?? 0;
}

export function canRunJob(
  workflowJobLabels: string[],
  runnerLabelsMatchers: string[][],
  workflowLabelCheckAll: boolean,
): boolean {
  runnerLabelsMatchers = runnerLabelsMatchers.map((runnerLabel) => {
    return runnerLabel.map((label) => label.toLowerCase());
  });
  const matchLabels = workflowLabelCheckAll
    ? runnerLabelsMatchers.some((rl) => workflowJobLabels.every((wl) => rl.includes(wl.toLowerCase())))
    : runnerLabelsMatchers.some((rl) => workflowJobLabels.some((wl) => rl.includes(wl.toLowerCase())));
  const match = workflowJobLabels.length === 0 ? !matchLabels : matchLabels;

  logger.debug(
    `Received workflow job event with labels: '${JSON.stringify(workflowJobLabels)}'. The event does ${
      match ? '' : 'NOT '
    }match the runner labels: '${Array.from(runnerLabelsMatchers).join(',')}'`,
  );
  return match;
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
