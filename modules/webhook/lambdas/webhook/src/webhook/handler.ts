import { Webhooks } from '@octokit/webhooks';
import { CheckRunEvent, WorkflowJobEvent } from '@octokit/webhooks-types';
import { IncomingHttpHeaders } from 'http';

import { Response } from '../lambda';
import { QueueConfig, sendActionRequest } from '../sqs';
import { getParameterValue } from '../ssm';
import { LogFields, logger as rootLogger } from './logger';

const supportedEvents = ['workflow_job'];
const logger = rootLogger.getChildLogger();

export async function handle(headers: IncomingHttpHeaders, body: string): Promise<Response> {
  const { environment, repositoryWhiteList, enableWorkflowLabelCheck, workflowLabelCheckAll, runnerLabels } =
    readEnvironmentVariables();

  // ensure header keys lower case since github headers can contain capitals.
  for (const key in headers) {
    headers[key.toLowerCase()] = headers[key];
  }

  const githubEvent = headers['x-github-event'] as string;

  let response: Response = {
    statusCode: await verifySignature(githubEvent, headers, body, environment),
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

  if (githubEvent == 'workflow_job') {
    const workflowJobEvent = payload as WorkflowJobEvent;
    const queue_details = matchLabels(workflowJobEvent.workflow_job.labels);
    response = await handleWorkflowJob(
      workflowJobEvent,
      githubEvent,
      enableWorkflowLabelCheck,
      workflowLabelCheckAll,
      runnerLabels,
      queue_details,
    );
  } else {
    response = {
      statusCode: 202,
      body: `Received event '${githubEvent}' ignored.`,
    };
  }
  return response;
}

function readEnvironmentVariables() {
  const environment = process.env.ENVIRONMENT;
  const enableWorkflowLabelCheckEnv = process.env.ENABLE_WORKFLOW_JOB_LABELS_CHECK || 'false';
  const enableWorkflowLabelCheck = JSON.parse(enableWorkflowLabelCheckEnv) as boolean;
  const workflowLabelCheckAllEnv = process.env.WORKFLOW_JOB_LABELS_CHECK_ALL || 'false';
  const workflowLabelCheckAll = JSON.parse(workflowLabelCheckAllEnv) as boolean;
  const repositoryWhiteListEnv = process.env.REPOSITORY_WHITE_LIST || '[]';
  const repositoryWhiteList = JSON.parse(repositoryWhiteListEnv) as Array<string>;
  const runnerLabelsEnv = (process.env.RUNNER_LABELS || '[]').toLowerCase();
  const runnerLabels = JSON.parse(runnerLabelsEnv) as Array<string>;
  return { environment, repositoryWhiteList, enableWorkflowLabelCheck, workflowLabelCheckAll, runnerLabels };
}

async function verifySignature(
  githubEvent: string,
  headers: IncomingHttpHeaders,
  body: string,
  environment: string,
): Promise<number> {
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

  const secret = await getParameterValue(environment, 'github_app_webhook_secret');

  const webhooks = new Webhooks({
    secret: secret,
  });
  if (!(await webhooks.verify(body, signature))) {
    logger.error('Unable to verify signature!', LogFields.print());
    return 401;
  }
  return 200;
}
function matchLabels(workflowLabels: string[]) {
  const queuesConfig = process.env.MULTI_RUNNER_QUEUES_CONFIG || '[]';
  const queue_configs = JSON.parse(queuesConfig) as Array<QueueConfig>;
  for (let queue of queue_configs) {
    if (canRunJob(queue.labelMatchers, workflowLabels, queue.exactMatch)) {
      return [queue] as QueueConfig[];
    }
  }
  return [] as QueueConfig[];
}

async function handleWorkflowJob(
  body: WorkflowJobEvent,
  githubEvent: string,
  enableWorkflowLabelCheck: boolean,
  workflowLabelCheckAll: boolean,
  runnerLabels: string[],
  queueConfig: Array<QueueConfig>,
): Promise<Response> {
  if (enableWorkflowLabelCheck && !canRunJob(body.workflow_job.labels, runnerLabels, workflowLabelCheckAll)) {
    logger.warn(
      `Received event contains runner labels '${body.workflow_job.labels}' that are not accepted.`,
      LogFields.print(),
    );
    return {
      statusCode: 202,
      body: `Received event contains runner labels '${body.workflow_job.labels}' that are not accepted.`,
    };
  }

  const installationId = getInstallationId(body);
  if (body.action === 'queued' && queueConfig.length > 0) {
    await sendActionRequest({
      id: body.workflow_job.id,
      repositoryName: body.repository.name,
      repositoryOwner: body.repository.owner.login,
      eventType: githubEvent,
      installationId: installationId,
      queueId: queueConfig[0].id,
      queueFifo: queueConfig[0].fifo,
    });
    logger.info(`Successfully queued job for ${body.repository.full_name}`, LogFields.print());
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

function canRunJob(workflowLabels: string[], runnerLabels: string[], workflowLabelCheckAll: boolean): boolean {
  const workflowJobLabels = workflowLabels;
  const match = workflowLabelCheckAll
    ? workflowJobLabels.every((l) => runnerLabels.includes(l.toLowerCase()))
    : workflowJobLabels.some((l) => runnerLabels.includes(l.toLowerCase()));

  logger.debug(
    `Received workflow job event with labels: '${JSON.stringify(workflowJobLabels)}'. The event does ${
      match ? '' : 'NOT '
    }match the runner labels: '${Array.from(runnerLabels).join(',')}'`,
    LogFields.print(),
  );
  return match;
}

function findLabel(workflowLabels: string[], labels: string[]): string {
  const filteredArray = workflowLabels.filter((wfLabel) =>
    labels.some((label) => label.toLowerCase() == wfLabel.toLowerCase()),
  );
  return filteredArray.length > 0 ? filteredArray[0] : '';
}
