import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { AppAuth } from '@octokit/auth-app/dist-types/types';
import { listRunners, createRunner } from './runners';
import yn from 'yn';

export interface ActionRequestMessage {
  id: number;
  eventType: string;
  repositoryName: string;
  repositoryOwner: string;
  installationId: number;
}

function createGithubAppAuth(installationId: number): AppAuth {
  const privateKey = Buffer.from(process.env.GITHUB_APP_KEY_BASE64 as string, 'base64').toString();
  const appId: number = parseInt(process.env.GITHUB_APP_ID as string);
  const clientId = process.env.GITHUB_APP_CLIENT_ID as string;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET as string;

  return createAppAuth({
    id: appId,
    privateKey: privateKey,
    installationId: installationId,
    clientId: clientId,
    clientSecret: clientSecret,
  });
}

async function createInstallationClient(githubAppAuth: AppAuth): Promise<Octokit> {
  const auth = await githubAppAuth({ type: 'installation' });
  return new Octokit({ auth: auth.token });
}

export const handle = async (eventSource: string, payload: ActionRequestMessage): Promise<void> => {
  if (eventSource !== 'aws:sqs') throw Error('Cannot handle non-SQS events!');
  const enableOrgLevel = yn(process.env.ENABLE_ORGANIZATION_RUNNERS, { default: true });
  const maximumRunners = parseInt(process.env.RUNNERS_MAXIMUM_COUNT || '3');
  const environment = process.env.ENVIRONMENT as string;
  const githubAppAuth = createGithubAppAuth(payload.installationId);
  const githubInstallationClient = await createInstallationClient(githubAppAuth);
  const queuedWorkflows = await githubInstallationClient.actions.listRepoWorkflowRuns({
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
      repoName: enableOrgLevel ? undefined : `${payload.repositoryOwner}/${payload.repositoryName}`,
    });
    console.info(
      `${
        enableOrgLevel
          ? `Organization ${payload.repositoryOwner}`
          : `Repo ${payload.repositoryOwner}/${payload.repositoryName}`
      } has ${currentRunners.length}/${maximumRunners} runners`,
    );
    console.log(currentRunners.length);
    console.log(maximumRunners);
    if (currentRunners.length < maximumRunners) {
      // create token
      const registrationToken = enableOrgLevel
        ? await githubInstallationClient.actions.createRegistrationTokenForOrg({ org: payload.repositoryOwner })
        : await githubInstallationClient.actions.createRegistrationTokenForRepo({
            owner: payload.repositoryOwner,
            repo: payload.repositoryName,
          });
      const token = registrationToken.data.token;

      await createRunner({
        environment: environment,
        runnerConfig: enableOrgLevel
          ? `--url https://github.com/${payload.repositoryOwner} --token ${token}`
          : `--url https://github.com/${payload.repositoryOwner}/${payload.repositoryName} --token ${token}`,
        orgName: enableOrgLevel ? payload.repositoryOwner : undefined,
        repoName: enableOrgLevel ? undefined : `${payload.repositoryOwner}/${payload.repositoryName}`,
      });
    } else {
      console.info('No runner will be created, maximum number of runners reached.');
    }
  }
};
