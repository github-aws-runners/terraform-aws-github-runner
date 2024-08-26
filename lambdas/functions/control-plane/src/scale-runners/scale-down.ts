import { Octokit } from '@octokit/rest';
import { createChildLogger } from '@terraform-aws-github-runner/aws-powertools-util';
import moment from 'moment';

import { createGithubAppAuth, createGithubInstallationAuth, createOctokitClient } from '../github/auth';
import { bootTimeExceeded, listEC2Runners, tag, terminateRunner } from './../aws/runners';
import { RunnerInfo, RunnerList } from './../aws/runners.d';
import { GhRunners, githubCache } from './cache';
import { ScalingDownConfig, getEvictionStrategy, getIdleRunnerCount } from './scale-down-config';
import { metricGitHubAppRateLimit } from '../github/rate-limit';

const logger = createChildLogger('scale-down');

async function getOrCreateOctokit(runner: RunnerInfo): Promise<Octokit> {
  const key = runner.owner;
  const cachedOctokit = githubCache.clients.get(key);

  if (cachedOctokit) {
    logger.debug(`[createGitHubClientForRunner] Cache hit for ${key}`);
    return cachedOctokit;
  }

  logger.debug(`[createGitHubClientForRunner] Cache miss for ${key}`);
  const ghesBaseUrl = process.env.GHES_URL;
  let ghesApiUrl = '';
  if (ghesBaseUrl) {
    ghesApiUrl = `${ghesBaseUrl}/api/v3`;
  }
  const ghAuthPre = await createGithubAppAuth(undefined, ghesApiUrl);
  const githubClientPre = await createOctokitClient(ghAuthPre.token, ghesApiUrl);

  const installationId =
    runner.type === 'Org'
      ? (
          await githubClientPre.apps.getOrgInstallation({
            org: runner.owner,
          })
        ).data.id
      : (
          await githubClientPre.apps.getRepoInstallation({
            owner: runner.owner.split('/')[0],
            repo: runner.owner.split('/')[1],
          })
        ).data.id;
  const ghAuth = await createGithubInstallationAuth(installationId, ghesApiUrl);
  const octokit = await createOctokitClient(ghAuth.token, ghesApiUrl);
  githubCache.clients.set(key, octokit);

  return octokit;
}

async function getGitHubRunnerBusyState(client: Octokit, ec2runner: RunnerInfo, runnerId: number): Promise<boolean> {
  const state =
    ec2runner.type === 'Org'
      ? await client.actions.getSelfHostedRunnerForOrg({
          runner_id: runnerId,
          org: ec2runner.owner,
        })
      : await client.actions.getSelfHostedRunnerForRepo({
          runner_id: runnerId,
          owner: ec2runner.owner.split('/')[0],
          repo: ec2runner.owner.split('/')[1],
        });

  logger.info(`Runner '${ec2runner.instanceId}' - GitHub Runner ID '${runnerId}' - Busy: ${state.data.busy}`);

  metricGitHubAppRateLimit(state.headers);

  return state.data.busy;
}

async function listGitHubRunners(runner: RunnerInfo): Promise<GhRunners> {
  const key = runner.owner as string;
  const cachedRunners = githubCache.runners.get(key);
  if (cachedRunners) {
    logger.debug(`[listGithubRunners] Cache hit for ${key}`);
    return cachedRunners;
  }

  logger.debug(`[listGithubRunners] Cache miss for ${key}`);
  const client = await getOrCreateOctokit(runner);
  const runners =
    runner.type === 'Org'
      ? await client.paginate(client.actions.listSelfHostedRunnersForOrg, {
          org: runner.owner,
          per_page: 100,
        })
      : await client.paginate(client.actions.listSelfHostedRunnersForRepo, {
          owner: runner.owner.split('/')[0],
          repo: runner.owner.split('/')[1],
          per_page: 100,
        });
  githubCache.runners.set(key, runners);
  logger.debug(`[listGithubRunners] Cache set for ${key}`);
  logger.debug(`[listGithubRunners] Runners: ${JSON.stringify(runners)}`);
  return runners;
}

function runnerMinimumTimeExceeded(runner: RunnerInfo): boolean {
  const minimumRunningTimeInMinutes = process.env.MINIMUM_RUNNING_TIME_IN_MINUTES;
  const launchTimePlusMinimum = moment(runner.launchTime).utc().add(minimumRunningTimeInMinutes, 'minutes');
  const now = moment(new Date()).utc();
  return launchTimePlusMinimum < now;
}

async function removeRunner(ec2runner: RunnerInfo, ghRunnerIds: number[]): Promise<void> {
  const githubAppClient = await getOrCreateOctokit(ec2runner);
  try {
    const states = await Promise.all(
      ghRunnerIds.map(async (ghRunnerId) => {
        // Get busy state instead of using the output of listGitHubRunners(...) to minimize to race condition.
        return await getGitHubRunnerBusyState(githubAppClient, ec2runner, ghRunnerId);
      }),
    );

    if (states.every((busy) => busy === false)) {
      const statuses = await Promise.all(
        ghRunnerIds.map(async (ghRunnerId) => {
          return (
            ec2runner.type === 'Org'
              ? await githubAppClient.actions.deleteSelfHostedRunnerFromOrg({
                  runner_id: ghRunnerId,
                  org: ec2runner.owner,
                })
              : await githubAppClient.actions.deleteSelfHostedRunnerFromRepo({
                  runner_id: ghRunnerId,
                  owner: ec2runner.owner.split('/')[0],
                  repo: ec2runner.owner.split('/')[1],
                })
          ).status;
        }),
      );

      if (statuses.every((status) => status == 204)) {
        await terminateRunner(ec2runner.instanceId);
        logger.debug(`AWS runner instance '${ec2runner.instanceId}' is terminated and GitHub runner is de-registered.`);
      } else {
        logger.error(`Failed to de-register GitHub runner: ${statuses}`);
      }
    } else {
      logger.info(`Runner '${ec2runner.instanceId}' cannot be de-registered, because it is still busy.`);
    }
  } catch (e) {
    logger.error(`Runner '${ec2runner.instanceId}' cannot be de-registered. Error: ${e}`, {
      error: e as Error,
    });
  }
}

async function evaluateAndRemoveRunners(
  ec2Runners: RunnerInfo[],
  scaleDownConfigs: ScalingDownConfig[],
): Promise<void> {
  let idleCounter = getIdleRunnerCount(scaleDownConfigs);
  const evictionStrategy = getEvictionStrategy(scaleDownConfigs);
  const ownerTags = new Set(ec2Runners.map((runner) => runner.owner));

  for (const ownerTag of ownerTags) {
    const ec2RunnersFiltered = ec2Runners
      .filter((runner) => runner.owner === ownerTag)
      .sort(evictionStrategy === 'oldest_first' ? oldestFirstStrategy : newestFirstStrategy);
    logger.debug(`Found: '${ec2RunnersFiltered.length}' active GitHub runners with owner tag: '${ownerTag}'`);
    logger.debug(`Active GitHub runners with owner tag: '${ownerTag}': ${JSON.stringify(ec2RunnersFiltered)}`);
    for (const ec2Runner of ec2RunnersFiltered) {
      const ghRunners = await listGitHubRunners(ec2Runner);
      const ghRunnersFiltered = ghRunners.filter((runner: { name: string }) =>
        runner.name.endsWith(ec2Runner.instanceId),
      );
      logger.debug(
        `Found: '${ghRunnersFiltered.length}' GitHub runners for AWS runner instance: '${ec2Runner.instanceId}'`,
      );
      logger.debug(
        `GitHub runners for AWS runner instance: '${ec2Runner.instanceId}': ${JSON.stringify(ghRunnersFiltered)}`,
      );
      if (ghRunnersFiltered.length) {
        if (runnerMinimumTimeExceeded(ec2Runner)) {
          if (idleCounter > 0) {
            idleCounter--;
            logger.info(`Runner '${ec2Runner.instanceId}' will be kept idle.`);
          } else {
            logger.info(`Terminating all non busy runners.`);
            await removeRunner(
              ec2Runner,
              ghRunnersFiltered.map((runner: { id: number }) => runner.id),
            );
          }
        }
      } else if (bootTimeExceeded(ec2Runner)) {
        await markOrphan(ec2Runner.instanceId);
      } else {
        logger.debug(`Runner ${ec2Runner.instanceId} has not yet booted.`);
      }
    }
  }
}

async function markOrphan(instanceId: string): Promise<void> {
  try {
    await tag(instanceId, [{ Key: 'ghr:orphan', Value: 'true' }]);
    logger.info(`Runner '${instanceId}' marked as orphan.`);
  } catch (e) {
    logger.error(`Failed to mark runner '${instanceId}' as orphan.`, { error: e });
  }
}

async function terminateOrphan(environment: string): Promise<void> {
  try {
    const orphanRunners = await listEC2Runners({ environment, orphan: true });

    for (const runner of orphanRunners) {
      logger.info(`Terminating orphan runner '${runner.instanceId}'`);
      await terminateRunner(runner.instanceId).catch((e) => {
        logger.error(`Failed to terminate orphan runner '${runner.instanceId}'`, { error: e });
      });
    }
  } catch (e) {
    logger.warn(`Failure during orphan runner termination.`, { error: e });
  }
}

export function oldestFirstStrategy(a: RunnerInfo, b: RunnerInfo): number {
  if (a.launchTime === undefined) return 1;
  if (b.launchTime === undefined) return 1;
  if (a.launchTime < b.launchTime) return 1;
  if (a.launchTime > b.launchTime) return -1;
  return 0;
}

export function newestFirstStrategy(a: RunnerInfo, b: RunnerInfo): number {
  return oldestFirstStrategy(a, b) * -1;
}

async function listRunners(environment: string) {
  return await listEC2Runners({
    environment,
  });
}

function filterRunners(ec2runners: RunnerList[]): RunnerInfo[] {
  return ec2runners.filter((ec2Runner) => ec2Runner.type && !ec2Runner.orphan) as RunnerInfo[];
}

export async function scaleDown(): Promise<void> {
  githubCache.reset();
  const environment = process.env.ENVIRONMENT;
  const scaleDownConfigs = JSON.parse(process.env.SCALE_DOWN_CONFIG) as [ScalingDownConfig];

  // first runners marked to be orphan.
  await terminateOrphan(environment);

  // next scale down idle runners with respect to config and mark potential orphans
  const ec2Runners = await listRunners(environment);
  const activeEc2RunnersCount = ec2Runners.length;
  logger.info(`Found: '${activeEc2RunnersCount}' active GitHub EC2 runner instances before clean-up.`);
  logger.debug(`Active GitHub EC2 runner instances: ${JSON.stringify(ec2Runners)}`);

  if (activeEc2RunnersCount === 0) {
    logger.debug(`No active runners found for environment: '${environment}'`);
    return;
  }

  const runners = filterRunners(ec2Runners);
  await evaluateAndRemoveRunners(runners, scaleDownConfigs);

  const activeEc2RunnersCountAfter = (await listRunners(environment)).length;
  logger.info(`Found: '${activeEc2RunnersCountAfter}' active GitHub EC2 runners instances after clean-up.`);
}
