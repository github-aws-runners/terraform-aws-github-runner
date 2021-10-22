import { IncomingHttpHeaders } from 'http';
import { Webhooks } from '@octokit/webhooks';
import { sendActionRequest } from '../sqs';
import { CheckRunEvent, WorkflowJobEvent } from '@octokit/webhooks-types';
import { getParameterValue } from '../ssm';
import { logger as rootLogger } from './logger';

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
  logger.info(`Received Github event ${githubEvent} from ${payload.repository.full_name}`);

  if (isRepoNotAllowed(payload.repository.full_name)) {
    console.error(`Received event from unauthorized repository ${payload.repository.full_name}`);
    return 403;
  }

  if (githubEvent == 'workflow_job') {
    status = await handleWorkflowJob(payload as WorkflowJobEvent, githubEvent);
  } else if (githubEvent == 'check_run') {
    status = await handleCheckRun(payload as CheckRunEvent, githubEvent);
  } else {
    logger.warn(`Ignoring unsupported event ${githubEvent}`);
  }

  return status;
}

async function verifySignature(githubEvent: string, signature: string, body: string): Promise<number> {
  if (!signature) {
    logger.error("Github event doesn't have signature. This webhook requires a secret to be configured.");
    return 500;
  }

  const secret = await getParameterValue(process.env.ENVIRONMENT as string, 'github_app_webhook_secret');

  const webhooks = new Webhooks({
    secret: secret,
  });
  if (!(await webhooks.verify(body, signature))) {
    logger.error('Unable to verify signature!');
    return 401;
  }
  return 200;
}

async function handleWorkflowJob(body: WorkflowJobEvent, githubEvent: string): Promise<number> {
  const disableCheckWorkflowJobLabelsEnv = process.env.DISABLE_CHECK_WORKFLOW_JOB_LABELS || 'false';
  const disableCheckWorkflowJobLabels = JSON.parse(disableCheckWorkflowJobLabelsEnv) as boolean;
  if (!disableCheckWorkflowJobLabels && !canRunJob(body)) {
    logger.error(`Received event contains runner labels '${body.workflow_job.labels}' that are not accepted.`);
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
  }
  console.info(`Successfully queued job for ${body.repository.full_name}`);
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
  }
  console.info(`Successfully queued job for ${body.repository.full_name}`);
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
    `Received workflow job event with labels: '${JSON.stringify(job.workflow_job.labels)}'. The event does ${
      runnerMatch ? '' : 'NOT '
    }match the configured labels: '${Array.from(runnerLabels).join(',')}'`,
  );
  return runnerMatch;
}
