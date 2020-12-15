import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { AppAuth } from '@octokit/auth-app/dist-types/types';
import { listRunners, createRunner } from './runners';
import yn from 'yn';
import { decrypt } from './kms';

export interface ActionRequestMessage {
  id: number;
  eventType: string;
  repositoryName: string;
  repositoryOwner: string;
  installationId: number;
}

const getfqdn= process.env.ENTERPRISE_URL as string;

export async function createGithubAppAuth(installationId: number | undefined): Promise<AppAuth> {
  //const privateKey = Buffer.from(process.env.GITHUB_APP_KEY_BASE64 as string, 'base64').toString();
  const clientSecret = await decrypt(
    process.env.GITHUB_APP_CLIENT_SECRET as string,
    process.env.KMS_KEY_ID as string,
    process.env.ENVIRONMENT as string,
  );
  const privateKeyBase64 = await decrypt(
    process.env.GITHUB_APP_KEY_BASE64 as string,
    process.env.KMS_KEY_ID as string,
    process.env.ENVIRONMENT as string,
  );
  if (clientSecret === undefined || privateKeyBase64 === undefined) {
    throw Error('Cannot decrypt.');
  }

  const privateKey = Buffer.from(privateKeyBase64, 'base64').toString();

  const appId: number = parseInt(process.env.GITHUB_APP_ID as string);
  const clientId = process.env.GITHUB_APP_CLIENT_ID as string;
  
  if (getfqdn === 'github.com'){
    var githubapiurl= 'https://api.github.com'
  }
  else{
        githubapiurl= 'https://'+getfqdn+'/api/v3'

  }

  return createAppAuth({
    appId: appId,
    privateKey: privateKey,
    installationId: installationId,
    clientId: clientId,
    clientSecret: clientSecret,
    baseUrl: githubapiurl
  });
}

export async function createInstallationClient(githubAppAuth: AppAuth): Promise<Octokit> {
  const auth = await githubAppAuth({ type: 'installation' });

  return new  Octokit({ auth: auth.token });
}

export const scaleUp = async (eventSource: string, payload: ActionRequestMessage): Promise<void> => {
  if (eventSource !== 'aws:sqs') throw Error('Cannot handle non-SQS events!');
  const enableOrgLevel = yn(process.env.ENABLE_ORGANIZATION_RUNNERS, { default: true });
  const maximumRunners = parseInt(process.env.RUNNERS_MAXIMUM_COUNT || '3');
  const runnerExtraLabels = process.env.RUNNER_EXTRA_LABELS;
  const environment = process.env.ENVIRONMENT as string;
  const githubAppAuth = await createGithubAppAuth(payload.installationId);
  const githubInstallationClient = await createInstallationClient(githubAppAuth);
  const queuedWorkflows = await githubInstallationClient.actions.listWorkflowRunsForRepo({
    owner: payload.repositoryOwner,
    repo: payload.repositoryName,
    // @ts-ignore (typing of the 'status' field is incorrect)
    status: 'queued',
  });
  console.info(
    `Repo ${payload.repositoryOwner}/${payload.repositoryName} has ${queuedWorkflows.data.total_count} queued workflow runs`,
  );

  if (queuedWorkflows.data.total_count > 0) {
    const currentRunners = await listRunners({
      environment: environment,
      repoName: enableOrgLevel ? undefined : `${payload.repositoryOwner}/${payload.repositoryName}`,
    });
    console.info(
      `${
        enableOrgLevel
          ? `Organization ${payload.repositoryOwner}`
          : `Repo ${payload.repositoryOwner}/${payload.repositoryName}`
      } has ${currentRunners.length}/${maximumRunners} runners`,
    );

    if (currentRunners.length < maximumRunners) {
      // create token
      console.debug('trying to create token to register runner');
      const registrationToken = enableOrgLevel
        ? await githubInstallationClient.actions.createRegistrationTokenForOrg({ org: payload.repositoryOwner })
        : await githubInstallationClient.actions.createRegistrationTokenForRepo({
            owner: payload.repositoryOwner,
            repo: payload.repositoryName,
          });
      const token = registrationToken.data.token;

   const labelsArgument = runnerExtraLabels !== undefined ? `--labels ${runnerExtraLabels}` : '';
      await createRunner({
        environment: environment,
        runnerConfig: enableOrgLevel
          ? `--url https://${getfqdn}/${payload.repositoryOwner} --token ${token}`
          : `--url https://${getfqdn}/${payload.repositoryOwner}/${payload.repositoryName} --token ${token}`,
        orgName: enableOrgLevel ? payload.repositoryOwner : undefined,
        repoName: enableOrgLevel ? undefined : `${payload.repositoryOwner}/${payload.repositoryName}`,
      });
    } else {
      console.info('No runner will be created, maximum number of runners reached.');
    }
  }
};

