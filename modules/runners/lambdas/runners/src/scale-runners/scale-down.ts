import { Octokit } from '@octokit/rest';
import moment from 'moment';
import yn from 'yn';
import { listRunners, RunnerInfo, terminateRunner } from './runners';
import { getIdleRunnerCount, ScalingDownConfig } from './scale-down-config';
import { createOctoClient, createGithubAuth } from './gh-auth';


function createGitHubClientForRunnerFactory(): (runner: RunnerInfo) => Promise<Octokit> {
  const cache: Map<string, Octokit> = new Map();

  return async (runner: RunnerInfo) => {
    const ghesBaseUrl = process.env.GHES_URL;
    let ghesApiUrl = '';
    if (ghesBaseUrl) {
      ghesApiUrl = `${ghesBaseUrl}/api/v3`;
    }
    const ghAuth = await createGithubAuth(undefined, 'app', ghesApiUrl);
    const githubClient = await createOctoClient(ghAuth.token, ghesApiUrl);
    const key = runner.owner;
    const cachedOctokit = cache.get(key);

    if (cachedOctokit) {
      console.debug(`[createGitHubClientForRunner] Cache hit for ${key}`);
      return cachedOctokit;
    }

    console.debug(`[createGitHubClientForRunner] Cache miss for ${key}`);
    const installationId = runner.type === 'Org'
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
  runner: RunnerInfo
) => Promise<GhRunners> {
  const cache: Map<string, GhRunners> = new Map();
  return async (client: Octokit, runner: RunnerInfo) => {
    const key = runner.owner as string;
    const cachedRunners = cache.get(key);
    if (cachedRunners) {
      console.debug(`[listGithubRunners] Cache hit for ${key}`);
      return cachedRunners;
    }

    console.debug(`[listGithubRunners] Cache miss for ${key}`);
    const runners = runner.type === 'Org'
      ? await client.paginate(client.actions.listSelfHostedRunnersForOrg, {
          org: runner.owner,
        })
      : await client.paginate(client.actions.listSelfHostedRunnersForRepo, {
          owner: runner.owner.split('/')[0],
          repo: runner.owner.split('/')[1],
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
  githubAppClient: Octokit,
): Promise<void> {
  try {
    const result = ec2runner.type === 'Org'
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
  const ec2Runners = (
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

  if (ec2Runners.length === 0) {
    console.debug(`No active runners found for environment: '${environment}'`);
    return;
  }

  const createGitHubClientForRunner = createGitHubClientForRunnerFactory();
  const listGithubRunners = listGithubRunnersFactory();

  const ownerTags = new Set(ec2Runners.map(runner => runner.owner));

  for (const ownerTag of ownerTags) {
    const ec2RunnersFiltered = ec2Runners.filter(runner => runner.owner === ownerTag);
    for (const ec2runner of ec2RunnersFiltered) {
      // TODO: This is a bug. Orphaned runners should be terminated no matter how long they have been running.
      if (runnerMinimumTimeExceeded(ec2runner, minimumRunningTimeInMinutes)) {
        const githubAppClient = await createGitHubClientForRunner(ec2runner);
        const ghRunners = await listGithubRunners(githubAppClient, ec2runner);
        let orphanEc2Runner = true;
        for (const ghRunner of ghRunners) {
          const runnerName = ghRunner.name as string;
          if (runnerName === ec2runner.instanceId) {
            orphanEc2Runner = false;
            if (idleCounter > 0) {
              idleCounter--;
              console.debug(`Runner '${ec2runner.instanceId}' will kept idle.`);
            } else {
              await removeRunner(ec2runner, ghRunner.id, githubAppClient);
              const instanceIndex = ec2Runners.findIndex(runner => runner.instanceId === ec2runner.instanceId);
              ec2Runners.splice(instanceIndex, 1);
            }
            break;
          }
        }

        // Remove orphan AWS runners.
        if (orphanEc2Runner) {
          console.info(`Runner '${ec2runner.instanceId}' is orphan, and will be removed.`);
          try {
            await terminateRunner(ec2runner);
            const instanceIndex = ec2Runners.findIndex(runner => runner.instanceId === ec2runner.instanceId);
            ec2Runners.splice(instanceIndex, 1);
          } catch (e) {
            console.debug(`Orphan runner '${ec2runner.instanceId}' cannot be removed.`);
          }
        }
      }
    }
  }
}
