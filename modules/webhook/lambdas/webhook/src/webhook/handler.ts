import { IncomingHttpHeaders } from 'http';
import { Webhooks } from '@octokit/webhooks';
import { sendActionRequest } from '../sqs';
import { CheckRunEvent } from '@octokit/webhooks-types';
import { decrypt } from '../kms';

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

  const secret = await decrypt(
    process.env.GITHUB_APP_WEBHOOK_SECRET as string,
    process.env.KMS_KEY_ID as string,
    process.env.ENVIRONMENT as string,
  );
  if (secret === undefined) {
    console.error('Cannot decrypt secret.');
    return 500;
  }

  const webhooks = new Webhooks({
    secret: secret,
  });
  if (!(await webhooks.verify(payload, signature))) {
    console.error('Unable to verify signature!');
    return 401;
  }

  const githubEvent = headers['x-github-event'] as string;

  console.debug(`Received Github event: "${githubEvent}"`);

  if (githubEvent === 'check_run') {
    const body = JSON.parse(payload) as CheckRunEvent;

    const repositoryWhiteListEnv = (process.env.REPOSITORY_WHITE_LIST as string) || '[]';
    const repositoryWhiteList = JSON.parse(repositoryWhiteListEnv) as Array<string>;

    if (repositoryWhiteList.length > 0) {
      const repositoryFullName = body.repository.full_name;
      if (!repositoryWhiteList.includes(repositoryFullName)) {
        console.error(`Received event from unauthorized repository ${repositoryFullName}`);
        return 500;
      }
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
  } else {
    console.debug('Ignore event ' + githubEvent);
  }

  return 200;
};
