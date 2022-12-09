import { Webhooks } from '@octokit/webhooks';
import { CheckRunEvent, WorkflowJobEvent } from '@octokit/webhooks-types';
import { IncomingHttpHeaders } from 'http';

import { Response } from '../lambda';
import { QueueConfig, sendActionRequest, sendWebhookEventToWorkflowJobQueue } from '../sqs';
import { getParameterValue } from '../ssm';
import { LogFields, logger as rootLogger } from './logger';

const supportedEvents = ['workflow_job'];
const logger = rootLogger.getChildLogger();

export async function handle(headers: IncomingHttpHeaders, body: string): Promise<Response> {
  const { environment, repositoryWhiteList, queuesConfig } = readEnvironmentVariables();

  // ensure header keys lower case since github headers can contain capitals.
  for (const key in headers) {
    headers[key.toLowerCase()] = headers[key];
  }

  const githubEvent = headers['x-github-event'] as string;

  let response: Response = {
    statusCode: await verifySignature(githubEvent, headers, body),
  };

  if (response.statusCode != 200) {
    return response;
  }

  if (!supportedEvents.includes(githubEvent)) {
    logger.warn(`Unsupported event type.`, LogFields.print());
    return {
      statusCode: 202,
      body: `Ignoring unsupported event ${githubEvent}`,
    };
  }

  const payload = JSON.parse(body);
  LogFields.fields.event = githubEvent;
  LogFields.fields.repository = payload.repository.full_name;
  LogFields.fields.action = payload.action;
  LogFields.fields.name = payload[githubEvent].name;
  LogFields.fields.status = payload[githubEvent].status;
  LogFields.fields.workflowJobId = payload[githubEvent].id;
  LogFields.fields.started_at = payload[githubEvent]?.started_at;

  /*
  The app subscribes to all `check_run` and `workflow_job` events.
  If the event status is `completed`, log the data for workflow metrics.
  */
  LogFields.fields.completed_at = payload[githubEvent]?.completed_at;
  LogFields.fields.conclusion = payload[githubEvent]?.conclusion;
  if (isRepoNotAllowed(payload.repository.full_name, repositoryWhiteList)) {
    logger.error(`Received event from unauthorized repository ${payload.repository.full_name}`, LogFields.print());
    return {
      statusCode: 403,
    };
  }

  logger.info(`Processing Github event`, LogFields.print());
  logger.debug(`Queue configuration: ${queuesConfig}`, LogFields.print());

  const workflowJobEvent = payload as WorkflowJobEvent;
  response = await handleWorkflowJob(workflowJobEvent, githubEvent, queuesConfig);
  await sendWorkflowJobEvents(workflowJobEvent);
  return response;
}
async function sendWorkflowJobEvents(workflowEventPayload: WorkflowJobEvent) {
  await sendWebhookEventToWorkflowJobQueue({
    workflowJobEvent: workflowEventPayload,
  });
}

function readEnvironmentVariables() {
  const environment = process.env.ENVIRONMENT;
  const repositoryWhiteListEnv = process.env.REPOSITORY_WHITE_LIST || '[]';
  const repositoryWhiteList = JSON.parse(repositoryWhiteListEnv) as Array<string>;
  const queuesConfigEnv = process.env.RUNNER_CONFIG || '[]';
  const queuesConfig = JSON.parse(queuesConfigEnv) as Array<QueueConfig>;
  return { environment, repositoryWhiteList, queuesConfig };
}

async function verifySignature(githubEvent: string, headers: IncomingHttpHeaders, body: string): Promise<number> {
  let signature;
  if ('x-hub-signature-256' in headers) {
    signature = headers['x-hub-signature-256'] as string;
  } else {
    signature = headers['x-hub-signature'] as string;
  }
  if (!signature) {
    logger.error(
      "Github event doesn't have signature. This webhook requires a secret to be configured.",
      LogFields.print(),
    );
    return 500;
  }

  const secret = await getParameterValue(process.env.PARAMETER_GITHUB_APP_WEBHOOK_SECRET);

  const webhooks = new Webhooks({
    secret: secret,
  });
  if (!(await webhooks.verify(body, signature))) {
    logger.error('Unable to verify signature!', LogFields.print());
    return 401;
  }
  return 200;
}

async function handleWorkflowJob(
  body: WorkflowJobEvent,
  githubEvent: string,
  queuesConfig: Array<QueueConfig>,
): Promise<Response> {
  const installationId = getInstallationId(body);
  if (body.action === 'queued') {
    // sort the queuesConfig by order of matcher config exact match, with all true matches lined up ahead.
    queuesConfig.sort((a, b) => {
      return a.matcherConfig.exactMatch === b.matcherConfig.exactMatch ? 0 : a.matcherConfig.exactMatch ? -1 : 1;
    });
    for (const queue of queuesConfig) {
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
        logger.info(
          `Successfully queued job for ${body.repository.full_name} to the queue ${queue.id}`,
          LogFields.print(),
        );
        return { statusCode: 201 };
      }
    }
    logger.warn(
      `Received event contains runner labels '${body.workflow_job.labels}' that are not accepted.`,
      LogFields.print(),
    );
    return {
      statusCode: 202,
      body: `Received event contains runner labels '${body.workflow_job.labels}' that are not accepted.`,
    };
  }
  return { statusCode: 201 };
}

function getInstallationId(body: WorkflowJobEvent | CheckRunEvent) {
  let installationId = body.installation?.id;
  if (installationId == null) {
    installationId = 0;
  }
  return installationId;
}

function isRepoNotAllowed(repoFullName: string, repositoryWhiteList: string[]): boolean {
  return repositoryWhiteList.length > 0 && !repositoryWhiteList.includes(repoFullName);
}

function canRunJob(
  workflowJobLabels: string[],
  runnerLabelsMatchers: string[][],
  workflowLabelCheckAll: boolean,
): boolean {
  runnerLabelsMatchers = runnerLabelsMatchers.map((runnerLabel) => {
    return runnerLabel.map((label) => label.toLowerCase());
  });
  const match = workflowLabelCheckAll
    ? workflowJobLabels.every((wl) => runnerLabelsMatchers.some((rl) => rl.includes(wl.toLowerCase())))
    : workflowJobLabels.some((wl) => runnerLabelsMatchers.some((rl) => rl.includes(wl.toLowerCase())));

  logger.debug(
    `Received workflow job event with labels: '${JSON.stringify(workflowJobLabels)}'. The event does ${
      match ? '' : 'NOT '
    }match the runner labels: '${Array.from(runnerLabelsMatchers).join(',')}'`,
    LogFields.print(),
  );
  return match;
}
