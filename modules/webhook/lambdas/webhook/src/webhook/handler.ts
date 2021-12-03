import { IncomingHttpHeaders } from 'http';
import { Webhooks } from '@octokit/webhooks';
import { sendActionRequest } from '../sqs';
import { CheckRunEvent, WorkflowJobEvent } from '@octokit/webhooks-types';
import { getParameterValue } from '../ssm';
import { logger as rootLogger, LogFields } from './logger';
import { Response } from '../lambda';

const supportedEvents = ['check_run', 'workflow_job'];
const logger = rootLogger.getChildLogger();

export async function handle(headers: IncomingHttpHeaders, body: string): Promise<Response> {
  // ensure header keys lower case since github headers can contain capitals.
  for (const key in headers) {
    headers[key.toLowerCase()] = headers[key];
  }

  const githubEvent = headers['x-github-event'] as string;

  let response: Response = {
    statusCode: await verifySignature(githubEvent, headers['x-hub-signature'] as string, body),
  };

  if (response.statusCode != 200) {
    return response;
  }
  const payload = JSON.parse(body);
  LogFields.fields.event = githubEvent;
  LogFields.fields.repository = payload.repository.full_name;
  LogFields.fields.action = payload.action;

  if (!supportedEvents.includes(githubEvent)) {
    logger.warn(`Unsupported event type.`, LogFields.print());
    return {
      statusCode: 202,
      body: `Ignoring unsupported event ${githubEvent}`,
    };
  }

  LogFields.fields.name = payload[githubEvent].name;
  LogFields.fields.status = payload[githubEvent].status;
  LogFields.fields.started_at = payload[githubEvent]?.started_at;

  /*
  The app subscribes to all `check_run` and `workflow_job` events.
  If the event status is `completed`, log the data for workflow metrics.
  */
  LogFields.fields.completed_at = payload[githubEvent]?.completed_at;
  LogFields.fields.conclusion = payload[githubEvent]?.conclusion;

  if (isRepoNotAllowed(payload.repository.full_name)) {
    logger.error(`Received event from unauthorized repository ${payload.repository.full_name}`, LogFields.print());
    return {
      statusCode: 403,
    };
  }

  logger.info(`Processing Github event`, LogFields.print());

  if (githubEvent == 'workflow_job') {
    response = await handleWorkflowJob(payload as WorkflowJobEvent, githubEvent);
  } else if (githubEvent == 'check_run') {
    response = await handleCheckRun(payload as CheckRunEvent, githubEvent);
  }

  return response;
}

async function verifySignature(githubEvent: string, signature: string, body: string): Promise<number> {
  if (!signature) {
    logger.error(
      "Github event doesn't have signature. This webhook requires a secret to be configured.",
      LogFields.print(),
    );
    return 500;
  }

  const secret = await getParameterValue(process.env.ENVIRONMENT as string, 'github_app_webhook_secret');

  const webhooks = new Webhooks({
    secret: secret,
  });
  if (!(await webhooks.verify(body, signature))) {
    logger.error('Unable to verify signature!', LogFields.print());
    return 401;
  }
  return 200;
}

async function handleWorkflowJob(body: WorkflowJobEvent, githubEvent: string): Promise<Response> {
  const disableCheckWorkflowJobLabelsEnv = process.env.DISABLE_CHECK_WORKFLOW_JOB_LABELS || 'false';
  const disableCheckWorkflowJobLabels = JSON.parse(disableCheckWorkflowJobLabelsEnv) as boolean;
  if (!disableCheckWorkflowJobLabels && !canRunJob(body)) {
    logger.warn(
      `Received event contains runner labels '${body.workflow_job.labels}' that are not accepted.`,
      LogFields.print(),
    );
    return {
      statusCode: 202,
      body: `Received event contains runner labels '${body.workflow_job.labels}' that are not accepted.`,
    };
  }

  let installationId = body.installation?.id;
  if (installationId == null) {
    installationId = 0;
  }
  if (body.action === 'queued') {
    await sendActionRequest({
      id: body.workflow_job.id,
      repositoryName: body.repository.name,
      repositoryOwner: body.repository.owner.login,
      eventType: githubEvent,
      installationId: installationId,
    });
  }
  logger.info(`Successfully queued job for ${body.repository.full_name}`, LogFields.print());
  return { statusCode: 201 };
}

async function handleCheckRun(body: CheckRunEvent, githubEvent: string): Promise<Response> {
  let installationId = body.installation?.id;
  if (installationId == null) {
    installationId = 0;
  }
  if (body.action === 'created' && body.check_run.status === 'queued') {
    await sendActionRequest({
      id: body.check_run.id,
      repositoryName: body.repository.name,
      repositoryOwner: body.repository.owner.login,
      eventType: githubEvent,
      installationId: installationId,
    });
  }
  logger.info(`Successfully queued job for ${body.repository.full_name}`, LogFields.print());
  return { statusCode: 201 };
}

function isRepoNotAllowed(repo_full_name: string): boolean {
  const repositoryWhiteListEnv = process.env.REPOSITORY_WHITE_LIST || '[]';
  const repositoryWhiteList = JSON.parse(repositoryWhiteListEnv) as Array<string>;

  return repositoryWhiteList.length > 0 && !repositoryWhiteList.includes(repo_full_name);
}

function canRunJob(job: WorkflowJobEvent): boolean {
  const runnerLabelsEnv = process.env.RUNNER_LABELS || '[]';
  const runnerLabels = new Set(JSON.parse(runnerLabelsEnv) as Array<string>);

  // ensure the self-hosted label is in the list.
  runnerLabels.add('self-hosted');
  const workflowJobLabels = job.workflow_job.labels;

  // eslint-disable-next-line max-len
  // GitHub managed labels: https://docs.github.com/en/actions/hosting-your-own-runners/using-self-hosted-runners-in-a-workflow#using-default-labels-to-route-jobs
  const githubManagedLabels = ['self-hosted', 'linux', 'macOS', 'windows', 'x64', 'ARM', 'ARM64'];
  // Remove GitHub managed labels
  const customWorkflowJobLabels = workflowJobLabels.filter((l) => githubManagedLabels.indexOf(l) < 0);

  const runnerMatch = customWorkflowJobLabels.every((l) => runnerLabels.has(l));

  logger.debug(
    `Received workflow job event with labels: '${JSON.stringify(job.workflow_job.labels)}'. The event does ${
      runnerMatch ? '' : 'NOT '
    }match the configured labels: '${Array.from(runnerLabels).join(',')}'`,
    LogFields.print(),
  );
  return runnerMatch;
}
