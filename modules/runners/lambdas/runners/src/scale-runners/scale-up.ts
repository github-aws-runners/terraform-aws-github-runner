import { listRunners, createRunner, RunnerInputParameters } from './runners';
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
  const runnerGroup = process.env.RUNNER_GROUP_NAME;
  const environment = process.env.ENVIRONMENT;
  const ghesBaseUrl = process.env.GHES_URL;

  let ghesApiUrl = '';
  if (ghesBaseUrl) {
    ghesApiUrl = `${ghesBaseUrl}/api/v3`;
  }

  let installationId = payload.installationId;
  if (installationId == 0) {
    const ghAuth = await createGithubAuth(undefined, 'app', ghesApiUrl);
    const githubClient = await createOctoClient(ghAuth.token, ghesApiUrl);
    installationId = enableOrgLevel
      ? (
        await githubClient.apps.getOrgInstallation({
          org: payload.repositoryOwner,
        })
      ).data.id
      : (
        await githubClient.apps.getRepoInstallation({
          owner: payload.repositoryOwner,
          repo: payload.repositoryName,
        })
      ).data.id;
  }

  const ghAuth = await createGithubAuth(installationId, 'installation', ghesApiUrl);

  const githubInstallationClient = await createOctoClient(ghAuth.token, ghesApiUrl);
  const checkRun = await githubInstallationClient.checks.get({
    check_run_id: payload.id,
    owner: payload.repositoryOwner,
    repo: payload.repositoryName,
  });

  const runnerType = enableOrgLevel ? 'Org' : 'Repo';
  const runnerOwner = enableOrgLevel ? payload.repositoryOwner : `${payload.repositoryOwner}/${payload.repositoryName}`;

  if (checkRun.data.status === 'queued') {
    const currentRunners = await listRunners({
      environment,
      runnerType,
      runnerOwner,
    });
    console.info(`${runnerType} ${runnerOwner} has ${currentRunners.length}/${maximumRunners} runners`);

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
      const runnerGroupArgument = runnerGroup !== undefined ? ` --runnergroup ${runnerGroup}` : '';
      const configBaseUrl = ghesBaseUrl ? ghesBaseUrl : 'https://github.com';

      await createRunnerLoop({
        environment,
        runnerServiceConfig: enableOrgLevel
          ? `--url ${configBaseUrl}/${payload.repositoryOwner} --token ${token} ${labelsArgument}${runnerGroupArgument}`
          : `--url ${configBaseUrl}/${payload.repositoryOwner}/${payload.repositoryName} ` +
          `--token ${token} ${labelsArgument}`,
        runnerOwner,
        runnerType,
      });
    } else {
      console.info('No runner will be created, maximum number of runners reached.');
    }
  }
};

export async function createRunnerLoop(runnerParameters: RunnerInputParameters): Promise<void> {
  const launchTemplateNames = process.env.LAUNCH_TEMPLATE_NAME?.split(',') as string[];
  let launched = false;
  for (const launchTemplateName of launchTemplateNames) {
    console.info(`Attempting to launch instance using ${launchTemplateName}.`);
    try {
      await createRunner(runnerParameters, launchTemplateName);
      launched = true;
      break;
    } catch (error) {
      console.error(error);
    }
  }
  if (launched == false) {
    throw Error('All launch templates failed');
  }
}
