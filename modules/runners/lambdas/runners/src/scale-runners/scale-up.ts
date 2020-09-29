import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { AppAuth } from '@octokit/auth-app/dist-types/types';
import { listRunners, createRunner } from './runners';
import { getIdleRunnerCount, ScalingDownConfig } from './scale-down-config';
import yn from 'yn';
import { decrypt } from './kms';

export interface ActionRequestMessage {
  id: number;
  eventType: string;
  repositoryName: string;
  repositoryOwner: string;
  installationId: number;
}

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

  return createAppAuth({
    id: appId,
    privateKey: privateKey,
    installationId: installationId,
    clientId: clientId,
    clientSecret: clientSecret,
  });
}

export async function createInstallationClient(githubAppAuth: AppAuth): Promise<Octokit> {
  const auth = await githubAppAuth({ type: 'installation' });
  return new Octokit({ auth: auth.token });
}

async function createAppClient(githubAppAuth: AppAuth): Promise<Octokit> {
  const auth = await githubAppAuth({ type: 'app' });
  return new Octokit({ auth: auth.token });
}

export const scaleUp = async (): Promise<void> => {
  const enableOrgLevel = yn(process.env.ENABLE_ORGANIZATION_RUNNERS, { default: true });
  const maximumRunners = parseInt(process.env.RUNNERS_MAXIMUM_COUNT || '3');
  const runnerExtraLabels = process.env.RUNNER_EXTRA_LABELS;
  const environment = process.env.ENVIRONMENT as string;

  // Get repositoryOwner (Organization name) and installationId
  const githubClient = await createAppClient(await createGithubAppAuth(undefined));
  const repositoryOwner = (
    await githubClient.apps.getAuthenticated()
  ).data.owner.login
  const installationId = (
    await githubClient.apps.getOrgInstallation({
      org: repositoryOwner,
    })
  ).data.id

  // Login with Github
  const githubAppAuth = await createGithubAppAuth(installationId);
  const githubInstallationClient = await createInstallationClient(githubAppAuth);

  const repositoryList = (await githubInstallationClient.repos.listForOrg({
    org: repositoryOwner,
    type: "all",
    sort: "pushed"
  })).data

  // Initialize runners (if no runners)
  const currentRunnersInOrg = (await listRunners({
    environment: environment,
    repoName: undefined,
  })).length;
  console.info("Current runners: " + currentRunnersInOrg);
  const scaleDownConfigs = JSON.parse(process.env.SCALE_DOWN_CONFIG as string) as [ScalingDownConfig];
  const idleCounter = getIdleRunnerCount(scaleDownConfigs);
  if (currentRunnersInOrg < idleCounter) {
    const runnersToStart = idleCounter - currentRunnersInOrg;
    console.info(`There should be ${idleCounter} runners, ${runnersToStart} will be started`);
    for (let i = 0; i < runnersToStart; i++) {
      // create token
      const registrationToken = await githubInstallationClient.actions.createRegistrationTokenForOrg({ org: repositoryOwner })
      const token = registrationToken.data.token;
      
      console.info('A runner will be created.');
      const labelsArgument = runnerExtraLabels !== undefined ? `--labels ${runnerExtraLabels}` : '';
      await createRunner({
        environment: environment,
        runnerConfig: `--url https://github.com/${repositoryOwner} --token ${token} ${labelsArgument}`,
        orgName: repositoryOwner,
        repoName: undefined
      });
    }
    return
  }

  // Foreach repo check if there are queued workflows
  for (const repo of repositoryList) {

    // // If it was not updated in "" minutes, dont check it
    // const lastRepoCheckMins = 30;
    // const today = new Date().getTime();
    // const pushed_atDate = new Date(repo.pushed_at).getTime();
    // const diffMinsPushed_at = Math.floor((Math.abs(pushed_atDate - today)/1000)/60);
    // const updated_atDate = new Date(repo.updated_at).getTime();
    // const diffMinsUpdated_at = Math.floor((Math.abs(updated_atDate - today)/1000)/60);
    // if (diffMinsUpdated_at > lastRepoCheckMins || diffMinsPushed_at > lastRepoCheckMins ) {
    //   continue;
    // }

    const payload = {
      repositoryOwner,
      repositoryName: repo.name
    }

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
            ? `--url https://github.com/${payload.repositoryOwner} --token ${token} ${labelsArgument}`
            : `--url https://github.com/${payload.repositoryOwner}/${payload.repositoryName} --token ${token} ${labelsArgument}`,
          orgName: enableOrgLevel ? payload.repositoryOwner : undefined,
          repoName: enableOrgLevel ? undefined : `${payload.repositoryOwner}/${payload.repositoryName}`,
        });
      } else {
        console.info('No runner will be created, maximum number of runners reached.');
      }
    }
  }
};
