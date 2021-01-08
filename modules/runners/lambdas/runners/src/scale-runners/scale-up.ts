import { listRunners, createRunner } from './runners';
import { createOctoClient, createGithubAuth } from './gh-auth';
import yn from 'yn';

export interface ActionRequestMessage {
  id: number;
  eventType: string;
  repositoryName: string;
  repositoryOwner: string;
  installationId: number;
}

export const scaleUp = async (eventSource: string, payload: ActionRequestMessage): Promise<void> => {
  if (eventSource !== 'aws:sqs') throw Error('Cannot handle non-SQS events!');
  const enableOrgLevel = yn(process.env.ENABLE_ORGANIZATION_RUNNERS, { default: true });
  const maximumRunners = parseInt(process.env.RUNNERS_MAXIMUM_COUNT || '3');
  const runnerExtraLabels = process.env.RUNNER_EXTRA_LABELS;
  const environment = process.env.ENVIRONMENT as string;
  const ghesBaseUrl = process.env.GHES_URL as string;

  let ghesApiUrl: string = '';
  if (ghesBaseUrl) {
    ghesApiUrl = `${ghesBaseUrl}/api/v3`;
  }

  const ghAuth = await createGithubAuth(payload.installationId, 'installation', ghesApiUrl);
  const githubInstallationClient = await createOctoClient(ghAuth.token, ghesApiUrl);
  const checkRun = await githubInstallationClient.checks.get({
    check_run_id: payload.id,
    owner: payload.repositoryOwner,
    repo: payload.repositoryName,
  });

  const repoName = enableOrgLevel ? undefined : `${payload.repositoryOwner}/${payload.repositoryName}`;
  const orgName = enableOrgLevel ? payload.repositoryOwner : undefined;

  if (checkRun.data.status === 'queued') {
    const currentRunners = await listRunners({
      environment: environment,
      repoName: repoName,
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
      const configBaseUrl = ghesBaseUrl ? ghesBaseUrl : 'https://github.com';
      await createRunner({
        environment: environment,
        runnerConfig: enableOrgLevel
          ? `--url ${configBaseUrl}/${payload.repositoryOwner} --token ${token} ${labelsArgument}`
          : `--url ${configBaseUrl}/${payload.repositoryOwner}/${payload.repositoryName} --token ${token} ${labelsArgument}`,
        orgName: orgName,
        repoName: repoName,
      });
    } else {
      console.info('No runner will be created, maximum number of runners reached.');
    }
  }
};
