import { IncomingHttpHeaders } from 'http';
import crypto from 'crypto';
import { sendActionRequest, ActionRequestMessage } from '../sqs';
function signRequestBody(key: string, body: any) {
  return `sha1=${crypto.createHmac('sha1', key).update(body, 'utf8').digest('hex')}`;
}

export const handle = async (headers: IncomingHttpHeaders, payload: any): Promise<number> => {
  // ensure header keys lower case
  for (const key in headers) {
    headers[key.toLowerCase()] = headers[key];
  }
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET as string;
  const signature = headers['x-hub-signature'];
  const githubEvent = headers['x-github-event'];
  const id = headers['x-github-delivery'];
  const calculatedSig = signRequestBody(secret, payload);

  if (signature !== calculatedSig) {
    console.log('signature invalid.');
    return 401;
  }

  const body = JSON.parse(payload);

  console.log(`Github-Event: "${githubEvent}" with action: "${body.action}"`);

  if (githubEvent === 'check_run' && body.action === 'created' && body.check_run.status === 'queued') {
    await sendActionRequest({
      id: body.check_run.id,
      repositoryName: body.repository.name,
      repositoryOwner: body.repository.owner.login,
      eventType: githubEvent,
      installationId: body.installation.id,
    });
  } else {
    console.log('ignore event ' + githubEvent);
  }

  return 200;
};
