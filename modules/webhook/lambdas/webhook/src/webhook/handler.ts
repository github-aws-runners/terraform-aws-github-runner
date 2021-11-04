import { IncomingHttpHeaders } from 'http';
import { Webhooks } from '@octokit/webhooks';
import { sendActionRequest } from '../sqs';
import { CheckRunEvent, WorkflowJobEvent } from '@octokit/webhooks-types';
import { getParameterValue } from '../ssm';
import { logger as rootLogger } from './logger';

interface LogFields {
  [key: string]: string;
}

const logFields: LogFields = {};

const supportedEvents = ['check_run', 'workflow_job'];
const logger = rootLogger.getChildLogger();

export async function handle(headers: IncomingHttpHeaders, body: string): Promise<number> {
  // ensure header keys lower case since github headers can contain capitals.
  for (const key in headers) {
    headers[key.toLowerCase()] = headers[key];
  }

  const githubEvent = headers['x-github-event'] as string;

  let status = await verifySignature(githubEvent, headers['x-hub-signature'] as string, body);
  if (status != 200) {
    return status;
  }
  const payload = JSON.parse(body);

  logFields.event = githubEvent;
  logFields.repository = payload.repository.full_name;
  logFields.action = payload.action;

  if (!supportedEvents.includes(githubEvent)) {
    logger.error(logFields, `Unsupported event type.`);
    return status;
  }

  logFields.name = payload[githubEvent].name;
  logFields.status = payload[githubEvent].status;

  if (payload[githubEvent].started_at) {
    logFields.started_at = payload[githubEvent].started_at;
  }

  /*
  The app subscribes to all `check_run` and `workflow_job` events.
  If the event status is `completed`, log the data for workflow metrics.
  */
  if (payload[githubEvent].completed_at) {
    logFields.completed_at = payload[githubEvent].completed_at;
  }
  if (payload[githubEvent].conclusion) {
    logFields.conclusion = payload[githubEvent].conclusion;
  }

  if (isRepoNotAllowed(payload.repository.full_name)) {
    logger.error(logFields, `Received event from unauthorized repository`);
    return 403;
  }

  logger.info(logFields, `Received Github event`);

  if (githubEvent == 'workflow_job') {
    status = await handleWorkflowJob(payload as WorkflowJobEvent, githubEvent);
  } else if (githubEvent == 'check_run') {
    status = await handleCheckRun(payload as CheckRunEvent, githubEvent);
  }

  return status;
}

async function verifySignature(githubEvent: string, signature: string, body: string): Promise<number> {
  if (!signature) {
    logger.error(logFields, `Github event doesn't have signature. This webhook requires a secret to be configured.`);
    return 500;
  }

  const secret = await getParameterValue(process.env.ENVIRONMENT as string, 'github_app_webhook_secret');

  const webhooks = new Webhooks({
    secret: secret,
  });
  if (!(await webhooks.verify(body, signature))) {
    logger.error(logFields, `Unable to verify signature!`);
    return 401;
  }
  return 200;
}

async function handleWorkflowJob(body: WorkflowJobEvent, githubEvent: string): Promise<number> {
  const disableCheckWorkflowJobLabelsEnv = process.env.DISABLE_CHECK_WORKFLOW_JOB_LABELS || 'false';
  const disableCheckWorkflowJobLabels = JSON.parse(disableCheckWorkflowJobLabelsEnv) as boolean;
  if (!disableCheckWorkflowJobLabels && !canRunJob(body)) {
    logger.error(
      logFields,
      `Received event contains runner labels '${body.workflow_job.labels}' that are not accepted.`,
    );
    return 403;
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
    logger.info(logFields, `Successfully queued job`);
  }
  return 200;
}

async function handleCheckRun(body: CheckRunEvent, githubEvent: string): Promise<number> {
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
    logger.info(logFields, `Successfully queued job`);
  }
  return 200;
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
    logFields,
    `Received workflow job event with labels: '${JSON.stringify(job.workflow_job.labels)}'. The event does ${
      runnerMatch ? '' : 'NOT '
    }match the configured labels: '${Array.from(runnerLabels).join(',')}'`,
  );
  return runnerMatch;
}
