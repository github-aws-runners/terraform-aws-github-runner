import { IncomingHttpHeaders } from 'http';
import { Webhooks } from '@octokit/webhooks';
import { sendActionRequest } from '../sqs';
import { CheckRunEvent } from '@octokit/webhooks-types';
import { getParameterValue } from '../ssm';

// Event type not available yet in SDK
export interface WorkflowJob {
  action: 'queued' | 'created' | 'completed';
  workflow_job: {
    id: number;
    labels: [string];
  };
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: {
      login: string;
    };
  };
  organization: {
    login: string;
  };
  installation?: {
    id?: number;
  };
}

export const handle = async (headers: IncomingHttpHeaders, payload: any): Promise<number> => {
  // ensure header keys lower case since github headers can contain capitals.
  for (const key in headers) {
    headers[key.toLowerCase()] = headers[key];
  }

  const signature = headers['x-hub-signature'] as string;
  if (!signature) {
    console.error("Github event doesn't have signature. This webhook requires a secret to be configured.");
    return 500;
  }

  const secret = await getParameterValue(process.env.ENVIRONMENT as string, 'github_app_webhook_secret');

  const webhooks = new Webhooks({
    secret: secret,
  });
  if (!(await webhooks.verify(payload as string, signature))) {
    console.error('Unable to verify signature!');
    return 401;
  }

  const githubEvent = headers['x-github-event'] as string;

  console.debug(`Received Github event: "${githubEvent}"`);

  let status = 200;
  if (githubEvent == 'workflow_job') {
    status = await handleWorkflowJob(JSON.parse(payload) as WorkflowJob, githubEvent);
  } else if (githubEvent == 'check_run') {
    status = await handleCheckRun(JSON.parse(payload) as CheckRunEvent, githubEvent);
  } else {
    console.debug('Ignore event ' + githubEvent);
  }

  return status;
};

async function handleWorkflowJob(body: WorkflowJob, githubEvent: string): Promise<number> {
  if (isRepoNotAllowed(body)) {
    console.error(`Received event from unauthorized repository ${body.repository.full_name}`);
    return 403;
  }

  if (isRunnerNotAllowed(body)) {
    console.error(`Received event contains runner labels '${body.workflow_job.labels}' that are not accepted.`);
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
  return 200;
}

async function handleCheckRun(body: CheckRunEvent, githubEvent: string): Promise<number> {
  if (isRepoNotAllowed(body)) {
    console.error(`Received event from unauthorized repository ${body.repository.full_name}`);
    return 403;
  }

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
  return 200;
}

function isRepoNotAllowed(body: WorkflowJob | CheckRunEvent): boolean {
  const repositoryWhiteListEnv = (process.env.REPOSITORY_WHITE_LIST as string) || '[]';
  const repositoryWhiteList = JSON.parse(repositoryWhiteListEnv) as Array<string>;

  return repositoryWhiteList.length > 0 && !repositoryWhiteList.includes(body.repository.full_name);
}

function isRunnerNotAllowed(job: WorkflowJob): boolean {
  const runnerLabelsEnv = (process.env.RUNNER_LABELS as string) || '[]';
  const runnerLabels = new Set(JSON.parse(runnerLabelsEnv) as Array<string>);

  // ensure the self-hosted label is in the list.
  runnerLabels.add('self-hosted');
  const runnerMatch = job.workflow_job.labels.every((l) => runnerLabels.has(l));

  console.debug(
    `Received workflow job event with labels: '${JSON.stringify(job.workflow_job.labels)}'. The event does ${
      runnerMatch ? '' : 'NOT'
    } match the configured labels: '${JSON.stringify(runnerLabels)}'`,
  );
  return !runnerMatch;
}
