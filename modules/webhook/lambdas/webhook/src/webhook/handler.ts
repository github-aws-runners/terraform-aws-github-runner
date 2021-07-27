import { IncomingHttpHeaders } from 'http';
import { Webhooks } from '@octokit/webhooks';
import { sendActionRequest } from '../sqs';
import { CheckRunEvent } from '@octokit/webhooks-types';
import { getParameterValue } from '../ssm';

export const handle = async (headers: IncomingHttpHeaders, payload: string | null): Promise<number> => {
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

  if (githubEvent === 'check_run') {
    const body = JSON.parse(payload as string) as CheckRunEvent;

    const repositoryWhiteListEnv = (process.env.REPOSITORY_WHITE_LIST as string) || '[]';
    const repositoryWhiteList = JSON.parse(repositoryWhiteListEnv) as Array<string>;
    const repositoryFullName = body.repository.full_name;

    if (repositoryWhiteList.length > 0) {
      if (!repositoryWhiteList.includes(repositoryFullName)) {
        console.error(`Received event from unauthorized repository ${repositoryFullName}`);
        return 500;
      }
    }
    console.log(`Received event from repository ${repositoryFullName}`);

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
  } else {
    console.debug('Ignore event ' + githubEvent);
  }

  return 200;
};
