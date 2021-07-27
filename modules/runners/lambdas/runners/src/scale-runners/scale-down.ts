import { Octokit } from '@octokit/rest';
import moment from 'moment';
import yn from 'yn';
import { listRunners, RunnerInfo, terminateRunner } from './runners';
import { getIdleRunnerCount, ScalingDownConfig } from './scale-down-config';
import { createOctoClient, createGithubAuth } from './gh-auth';

interface Repo {
  repoName: string;
  repoOwner: string;
}

function getRepo(runner: RunnerInfo, orgLevel: boolean): Repo {
  return orgLevel
    ? { repoOwner: runner.org as string, repoName: '' }
    : { repoOwner: runner.repo?.split('/')[0] as string, repoName: runner.repo?.split('/')[1] as string };
}

function createGitHubClientForRunnerFactory(): (runner: RunnerInfo, orgLevel: boolean) => Promise<Octokit> {
  const cache: Map<string, Octokit> = new Map();

  return async (runner: RunnerInfo, orgLevel: boolean) => {
    const ghesBaseUrl = process.env.GHES_URL;
    let ghesApiUrl = '';
    if (ghesBaseUrl) {
      ghesApiUrl = `${ghesBaseUrl}/api/v3`;
    }
    const ghAuth = await createGithubAuth(undefined, 'app', ghesApiUrl);
    const githubClient = await createOctoClient(ghAuth.token, ghesApiUrl);
    const repo = getRepo(runner, orgLevel);
    const key = orgLevel ? repo.repoOwner : repo.repoOwner + repo.repoName;
    const cachedOctokit = cache.get(key);

    if (cachedOctokit) {
      console.debug(`[createGitHubClientForRunner] Cache hit for ${key}`);
      return cachedOctokit;
    }

    console.debug(`[createGitHubClientForRunner] Cache miss for ${key}`);
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
    const ghAuth2 = await createGithubAuth(installationId, 'installation', ghesApiUrl);
    const octokit = await createOctoClient(ghAuth2.token, ghesApiUrl);
    cache.set(key, octokit);

    return octokit;
  };
}

/**
 * Extract the inner type of a promise if any
 */
export type UnboxPromise<T> = T extends Promise<infer U> ? U : T;

type GhRunners = UnboxPromise<ReturnType<Octokit['actions']['listSelfHostedRunnersForRepo']>>['data']['runners'];

function listGithubRunnersFactory(): (
  client: Octokit,
  runner: RunnerInfo,
  enableOrgLevel: boolean,
) => Promise<GhRunners> {
  const cache: Map<string, GhRunners> = new Map();
  return async (client: Octokit, runner: RunnerInfo, enableOrgLevel: boolean) => {
    const repo = getRepo(runner, enableOrgLevel);
    const key = enableOrgLevel ? repo.repoOwner : repo.repoOwner + repo.repoName;
    const cachedRunners = cache.get(key);
    if (cachedRunners) {
      console.debug(`[listGithubRunners] Cache hit for ${key}`);
      return cachedRunners;
    }

    console.debug(`[listGithubRunners] Cache miss for ${key}`);
    const runners = enableOrgLevel
      ? await client.paginate(client.actions.listSelfHostedRunnersForOrg, {
        org: repo.repoOwner,
      })
      : await client.paginate(client.actions.listSelfHostedRunnersForRepo, {
        owner: repo.repoOwner,
        repo: repo.repoName,
      });
    cache.set(key, runners);

    return runners;
  };
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
  const scaleDownConfigs = JSON.parse(process.env.SCALE_DOWN_CONFIG) as [ScalingDownConfig];
  const enableOrgLevel = yn(process.env.ENABLE_ORGANIZATION_RUNNERS, { default: true });
  const environment = process.env.ENVIRONMENT;
  const minimumRunningTimeInMinutes = process.env.MINIMUM_RUNNING_TIME_IN_MINUTES;
  let idleCounter = getIdleRunnerCount(scaleDownConfigs);

  // list and sort runners, newest first. This ensure we keep the newest runners longer.
  const runners = (
    await listRunners({
      environment,
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

  const createGitHubClientForRunner = createGitHubClientForRunnerFactory();
  const listGithubRunners = listGithubRunnersFactory();

  for (const ec2runner of runners) {
    if (!runnerMinimumTimeExceeded(ec2runner, minimumRunningTimeInMinutes)) {
      continue;
    }

    const githubAppClient = await createGitHubClientForRunner(ec2runner, enableOrgLevel);

    const repo = getRepo(ec2runner, enableOrgLevel);
    const ghRunners = await listGithubRunners(githubAppClient, ec2runner, enableOrgLevel);
    let orphanEc2Runner = true;
    for (const ghRunner of ghRunners) {
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
