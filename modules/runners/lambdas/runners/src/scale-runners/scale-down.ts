import { Octokit } from '@octokit/rest';
import moment from 'moment';
import { listEC2Runners, RunnerInfo, terminateRunner } from './runners';
import { getIdleRunnerCount, ScalingDownConfig } from './scale-down-config';
import { createOctoClient, createGithubAuth, createGithubInstallationAuth } from './gh-auth';
import { githubCache, GhRunners } from './cache';

async function getOrCreateOctokit(runner: RunnerInfo): Promise<Octokit> {
  const key = runner.owner;
  const cachedOctokit = githubCache.clients.get(key);

  if (cachedOctokit) {
    console.debug(`[createGitHubClientForRunner] Cache hit for ${key}`);
    return cachedOctokit;
  }

  console.debug(`[createGitHubClientForRunner] Cache miss for ${key}`);
  const ghesBaseUrl = process.env.GHES_URL;
  let ghesApiUrl = '';
  if (ghesBaseUrl) {
    ghesApiUrl = `${ghesBaseUrl}/api/v3`;
  }
  const ghAuth = await createGithubAuth(undefined, 'app', ghesApiUrl);
  const githubClient = await createOctoClient(ghAuth.token, ghesApiUrl);

  const installationId =
    runner.type === 'Org'
      ? (
          await githubClient.apps.getOrgInstallation({
            org: runner.owner,
          })
        ).data.id
      : (
          await githubClient.apps.getRepoInstallation({
            owner: runner.owner.split('/')[0],
            repo: runner.owner.split('/')[1],
          })
        ).data.id;
  const ghAuth2 = await createGithubInstallationAuth(installationId, ghesApiUrl);
  const octokit = await createOctoClient(ghAuth2.token, ghesApiUrl);
  githubCache.clients.set(key, octokit);

  return octokit;
}

async function listGitHubRunners(runner: RunnerInfo): Promise<GhRunners> {
  const key = runner.owner as string;
  const cachedRunners = githubCache.runners.get(key);
  if (cachedRunners) {
    console.debug(`[listGithubRunners] Cache hit for ${key}`);
    return cachedRunners;
  }

  const client = await getOrCreateOctokit(runner);
  console.debug(`[listGithubRunners] Cache miss for ${key}`);
  const runners =
    runner.type === 'Org'
      ? await client.paginate(client.actions.listSelfHostedRunnersForOrg, {
          org: runner.owner,
        })
      : await client.paginate(client.actions.listSelfHostedRunnersForRepo, {
          owner: runner.owner.split('/')[0],
          repo: runner.owner.split('/')[1],
        });
  githubCache.runners.set(key, runners);

  return runners;
}

function runnerMinimumTimeExceeded(runner: RunnerInfo, minimumRunningTimeInMinutes: string): boolean {
  const launchTimePlusMinimum = moment(runner.launchTime).utc().add(minimumRunningTimeInMinutes, 'minutes');
  const now = moment(new Date()).utc();
  return launchTimePlusMinimum < now;
}

async function removeRunner(ec2runner: RunnerInfo, ghRunnerId: number): Promise<void> {
  const githubAppClient = await getOrCreateOctokit(ec2runner);
  try {
    const result =
      ec2runner.type === 'Org'
        ? await githubAppClient.actions.deleteSelfHostedRunnerFromOrg({
            runner_id: ghRunnerId,
            org: ec2runner.owner,
          })
        : await githubAppClient.actions.deleteSelfHostedRunnerFromRepo({
            runner_id: ghRunnerId,
            owner: ec2runner.owner.split('/')[0],
            repo: ec2runner.owner.split('/')[1],
          });

    if (result.status == 204) {
      await terminateRunner(ec2runner.instanceId);
      console.info(`AWS runner instance '${ec2runner.instanceId}' is terminated and GitHub runner is de-registered.`);
    }
  } catch (e) {
    console.debug(`Runner '${ec2runner.instanceId}' cannot be de-registered, most likely the runner is active.`);
  }
}

async function evaluateAndRemoveRunners(
  ec2Runners: RunnerInfo[],
  scaleDownConfigs: ScalingDownConfig[],
  minimumRunningTimeInMinutes: string,
): Promise<void> {
  let idleCounter = getIdleRunnerCount(scaleDownConfigs);
  const ownerTags = new Set(ec2Runners.map((runner) => runner.owner));

  for (const ownerTag of ownerTags) {
    const ec2RunnersFiltered = ec2Runners.filter((runner) => runner.owner === ownerTag);
    for (const ec2runner of ec2RunnersFiltered) {
      // TODO: This is a bug. Orphaned runners should be terminated no matter how long they have been running.
      if (runnerMinimumTimeExceeded(ec2runner, minimumRunningTimeInMinutes)) {
        const ghRunners = await listGitHubRunners(ec2runner);
        const ghRunner = ghRunners.find((runner) => runner.name === ec2runner.instanceId);
        if (ghRunner) {
          if (idleCounter > 0) {
            idleCounter--;
            console.debug(`Runner '${ec2runner.instanceId}' will kept idle.`);
          } else {
            await removeRunner(ec2runner, ghRunner.id);
            const instanceIndex = ec2Runners.findIndex((runner) => runner.instanceId === ec2runner.instanceId);
            ec2Runners.splice(instanceIndex, 1);
          }
        } else {
          console.debug(`Runner '${ec2runner.instanceId}' is orphaned and will be removed.`);
          terminateOrphan(ec2runner.instanceId);
          const instanceIndex = ec2Runners.findIndex((runner) => runner.instanceId === ec2runner.instanceId);
          ec2Runners.splice(instanceIndex, 1);
        }
      }
    }
  }
}

async function terminateOrphan(instanceId: string): Promise<void> {
  try {
    await terminateRunner(instanceId);
  } catch (e) {
    console.debug(`Orphan runner '${instanceId}' cannot be removed.`);
  }
}

async function listAndSortRunners(environment: string) {
  return (
    await listEC2Runners({
      environment,
    })
  ).sort((a, b): number => {
    if (a.launchTime === undefined) return 1;
    if (b.launchTime === undefined) return 1;
    if (a.launchTime < b.launchTime) return 1;
    if (a.launchTime > b.launchTime) return -1;
    return 0;
  });
}

export async function scaleDown(): Promise<void> {
  const scaleDownConfigs = JSON.parse(process.env.SCALE_DOWN_CONFIG) as [ScalingDownConfig];
  const environment = process.env.ENVIRONMENT;
  const minimumRunningTimeInMinutes = process.env.MINIMUM_RUNNING_TIME_IN_MINUTES;

  // list and sort runners, newest first. This ensure we keep the newest runners longer.
  const ec2Runners = await listAndSortRunners(environment);

  if (ec2Runners.length === 0) {
    console.debug(`No active runners found for environment: '${environment}'`);
    return;
  }

  await evaluateAndRemoveRunners(ec2Runners, scaleDownConfigs, minimumRunningTimeInMinutes);
}
