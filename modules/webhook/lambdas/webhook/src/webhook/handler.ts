import { IncomingHttpHeaders } from 'http';
import crypto from 'crypto';
import { sendActionRequest } from '../sqs';
import { WebhookPayloadCheckRun } from '@octokit/webhooks';

function signRequestBody(key: string, body: any) {
  return `sha1=${crypto.createHmac('sha1', key).update(body, 'utf8').digest('hex')}`;
}

export const handle = async (headers: IncomingHttpHeaders, payload: any): Promise<number> => {
  // ensure header keys lower case since github headers can contain capitals.
  for (const key in headers) {
    headers[key.toLowerCase()] = headers[key];
  }

  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET as string;
  const signature = headers['x-hub-signature'];
  if (!signature) {
    console.error("Github event doesn't have signature. This webhook requires a secret to be configured.");
    return 500;
  }

  const calculatedSig = signRequestBody(secret, payload);
  if (signature !== calculatedSig) {
    console.error('Unable to verify signature!');
    return 401;
  }

  const githubEvent = headers['x-github-event'];

  console.debug(`Received Github event: "${githubEvent}"`);

  if (githubEvent === 'check_run') {
    const body = JSON.parse(payload) as WebhookPayloadCheckRun;
    if (body.action === 'created' && body.check_run.status === 'queued') {
      await sendActionRequest({
        id: body.check_run.id,
        repositoryName: body.repository.name,
        repositoryOwner: body.repository.owner.login,
        eventType: githubEvent,
        installationId: body.installation!.id,
      });
    }
  } else {
    console.debug('Ignore event ' + githubEvent);
  }

  return 200;
};
