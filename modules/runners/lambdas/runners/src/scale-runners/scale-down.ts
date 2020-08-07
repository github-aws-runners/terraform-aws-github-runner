import { Octokit } from '@octokit/rest';
import { AppAuth } from '@octokit/auth-app/dist-types/types';
import { listRunners, terminateRunner, RunnerInfo } from './runners';
import { createGithubAppAuth, createInstallationClient } from './scale-up';
import { getIdleRunnerCount, ScalingDownConfig } from './scale-down-config';
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

async function removeRunner(
  ec2runner: RunnerInfo,
  ghRunnerId: number,
  repo: Repo,
  enableOrgLevel: boolean,
  githubAppClient: Octokit,
): Promise<void> {
  try {
    const result = enableOrgLevel
      ? await githubAppClient.actions.deleteSelfHostedRunnerFromOrg({
          runner_id: ghRunnerId,
          org: repo.repoOwner,
        })
      : await githubAppClient.actions.deleteSelfHostedRunnerFromRepo({
          runner_id: ghRunnerId,
          owner: repo.repoOwner,
          repo: repo.repoName,
        });

    if (result.status == 204) {
      await terminateRunner(ec2runner);
      console.info(`AWS runner instance '${ec2runner.instanceId}' is terminated and GitHub runner is de-registered.`);
    }
  } catch (e) {
    console.debug(`Runner '${ec2runner.instanceId}' cannot be de-registered, most likely the runner is active.`);
  }
}

export async function scaleDown(): Promise<void> {
  const scaleDownConfigs = JSON.parse(process.env.SCALE_DOWN_CONFIG as string) as [ScalingDownConfig];

  const enableOrgLevel = yn(process.env.ENABLE_ORGANIZATION_RUNNERS, { default: true });
  const environment = process.env.ENVIRONMENT as string;
  const minimumRunningTimeInMinutes = process.env.MINIMUM_RUNNING_TIME_IN_MINUTES as string;
  let idleCounter = getIdleRunnerCount(scaleDownConfigs);

  // list and sort runners, newest first. This ensure we keep the newest runners longer.
  const runners = (
    await listRunners({
      environment: environment,
    })
  ).sort((a, b): number => {
    if (a.launchTime === undefined) return 1;
    if (b.launchTime === undefined) return 1;
    if (a.launchTime < b.launchTime) return 1;
    if (a.launchTime > b.launchTime) return -1;
    return 0;
  });

  if (runners.length === 0) {
    console.debug(`No active runners found for environment: '${environment}'`);
    return;
  }

  for (const ec2runner of runners) {
    if (!runnerMinimumTimeExceeded(ec2runner, minimumRunningTimeInMinutes)) {
      continue;
    }

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
      if (runnerName === ec2runner.instanceId) {
        orphanEc2Runner = false;
        if (idleCounter > 0) {
          idleCounter--;
          console.debug(`Runner '${ec2runner.instanceId}' will kept idle.`);
        } else {
          await removeRunner(ec2runner, ghRunner.id, repo, enableOrgLevel, githubAppClient);
        }
      }
    }

    // Remove orphan AWS runners.
    if (orphanEc2Runner) {
      console.info(`Runner '${ec2runner.instanceId}' is orphan, and will be removed.`);
      try {
        await terminateRunner(ec2runner);
      } catch (e) {
        console.debug(`Orphan runner '${ec2runner.instanceId}' cannot be removed.`);
      }
    }
  }
}
