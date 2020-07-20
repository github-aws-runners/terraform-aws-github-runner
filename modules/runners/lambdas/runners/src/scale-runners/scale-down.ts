import { Octokit } from '@octokit/rest';
import { AppAuth } from '@octokit/auth-app/dist-types/types';
import { listRunners, terminateRunner, RunnerInfo } from './runners';
import { createGithubAppAuth, createInstallationClient } from './scale-up';
import yn from 'yn';
import moment from 'moment';

async function createAppClient(githubAppAuth: AppAuth): Promise<Octokit> {
  const auth = await githubAppAuth({ type: 'app' });
  return new Octokit({ auth: auth.token });
}

interface Repo {
  repoName: string;
  repoOwner: string;
}

function getRepo(runner: RunnerInfo, orgLevel: boolean): Repo {
  return orgLevel
    ? { repoOwner: runner.org as string, repoName: '' }
    : { repoOwner: runner.repo?.split('/')[0] as string, repoName: runner.repo?.split('/')[1] as string };
}

async function createGitHubClientForRunner(runner: RunnerInfo, orgLevel: boolean): Promise<Octokit> {
  const githubClient = await createAppClient(await createGithubAppAuth(undefined));
  const repo = getRepo(runner, orgLevel);

  const installationId = orgLevel
    ? (
        await githubClient.apps.getOrgInstallation({
          org: repo.repoOwner,
        })
      ).data.id
    : (
        await githubClient.apps.getRepoInstallation({
          owner: repo.repoOwner,
          repo: repo.repoName,
        })
      ).data.id;

  return createInstallationClient(await createGithubAppAuth(installationId));
}

function runnerMinimumTimeExceeded(runner: RunnerInfo, minimumRunningTimeInMinutes: string): boolean {
  const launchTimePlusMinimum = moment(runner.launchTime).utc().add(minimumRunningTimeInMinutes, 'minutes');
  const now = moment(new Date()).utc();
  return launchTimePlusMinimum < now;
}

export async function scaleDown(): Promise<void> {
  const enableOrgLevel = yn(process.env.ENABLE_ORGANIZATION_RUNNERS, { default: true });
  const environment = process.env.ENVIRONMENT as string;
  const minimumRunningTimeInMinutes = process.env.MINIMUM_RUNNING_TIME_IN_MINUTES as string;

  const runners = await listRunners({
    environment: environment,
  });

  if (runners.length === 0) {
    console.debug(`No active runners found for environment: '${environment}'`);
    return;
  }

  for (const ec2runner of runners) {
    const githubAppClient = await createGitHubClientForRunner(ec2runner, enableOrgLevel);

    const repo = getRepo(ec2runner, enableOrgLevel);
    const registered = enableOrgLevel
      ? await githubAppClient.actions.listSelfHostedRunnersForOrg({
          org: repo.repoOwner,
        })
      : await githubAppClient.actions.listSelfHostedRunnersForRepo({
          owner: repo.repoOwner,
          repo: repo.repoName,
        });

    let orphanEc2Runner = true;
    for (const ghRunner of registered.data.runners) {
      const runnerName = ghRunner.name as string;
      if (runnerName === ec2runner.instanceId && runnerMinimumTimeExceeded(ec2runner, minimumRunningTimeInMinutes)) {
        orphanEc2Runner = false;
        try {
          const result = enableOrgLevel
            ? await githubAppClient.actions.deleteSelfHostedRunnerFromOrg({
                runner_id: ghRunner.id,
                org: repo.repoOwner,
              })
            : await githubAppClient.actions.deleteSelfHostedRunnerFromRepo({
                runner_id: ghRunner.id,
                owner: repo.repoOwner,
                repo: repo.repoName,
              });

          if (result.status == 204) {
            await terminateRunner(ec2runner);
            console.info(
              `AWS runner instance '${ec2runner.instanceId}' is terminated and GitHub runner '${runnerName}' is de-registered.`,
            );
          }
        } catch (e) {
          console.debug(`Runner '${runnerName}' cannot be de-registered, most likely the runner is active.`);
        }
      }
    }

    // Remove orphan AWS runners.
    if (orphanEc2Runner && runnerMinimumTimeExceeded(ec2runner, minimumRunningTimeInMinutes)) {
      console.info(`Runner '${ec2runner.instanceId}' is orphan, and will be removed.`);
      try {
        await terminateRunner(ec2runner);
      } catch (e) {
        console.debug(`Orphan runner '${ec2runner.instanceId}' cannot be removed.`);
      }
    }
  }
}
