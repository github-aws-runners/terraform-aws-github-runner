import { Octokit } from '@octokit/rest';
import { Endpoints } from '@octokit/types';
import { RequestError } from '@octokit/request-error';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { resolveComputeProviderType } from '@aws-github-runner/compute-providers/provider-types';
import moment from 'moment';

import { createGithubAppAuth, createGithubInstallationAuth, createOctokitClient } from '../github/auth';
import { controlPlaneProviderRegistry } from '../control-plane-providers';
import { GhRunners, githubCache } from './cache';
import { ScalingDownConfigList, getEvictionStrategy, getIdleRunnerCount } from './scale-down-config';
import { metricGitHubAppRateLimit } from '../github/rate-limit';
import { getGitHubEnterpriseApiUrl } from './github-runner';
import type { RunnerInfo, ScaleDownComputeProvider } from './types';

const logger = createChildLogger('scale-down');

type OrgRunnerList = Endpoints['GET /orgs/{org}/actions/runners']['response']['data']['runners'];
type RepoRunnerList = Endpoints['GET /repos/{owner}/{repo}/actions/runners']['response']['data']['runners'];
type RunnerState = OrgRunnerList[number] | RepoRunnerList[number];

async function getOrCreateOctokit(runner: RunnerInfo): Promise<Octokit> {
  const key = runner.owner;
  const cachedOctokit = githubCache.clients.get(key);

  if (cachedOctokit) {
    logger.debug(`[createGitHubClientForRunner] Cache hit for ${key}`);
    return cachedOctokit;
  }

  logger.debug(`[createGitHubClientForRunner] Cache miss for ${key}`);
  const { ghesApiUrl } = getGitHubEnterpriseApiUrl();
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

async function getGitHubSelfHostedRunnerState(
  client: Octokit,
  runner: RunnerInfo,
  runnerId: number,
): Promise<RunnerState | null> {
  try {
    const state =
      runner.type === 'Org'
        ? await client.actions.getSelfHostedRunnerForOrg({
            runner_id: runnerId,
            org: runner.owner,
          })
        : await client.actions.getSelfHostedRunnerForRepo({
            runner_id: runnerId,
            owner: runner.owner.split('/')[0],
            repo: runner.owner.split('/')[1],
          });
    metricGitHubAppRateLimit(state.headers);

    return state.data;
  } catch (error) {
    if (error instanceof RequestError && error.status === 404) {
      logger.info(`Runner '${runner.id}' with GitHub Runner ID '${runnerId}' not found on GitHub (404)`);
      return null;
    }
    throw error;
  }
}

async function getGitHubRunnerBusyState(client: Octokit, runner: RunnerInfo, runnerId: number): Promise<boolean> {
  const state = await getGitHubSelfHostedRunnerState(client, runner, runnerId);
  if (state === null) {
    logger.info(`Runner '${runner.id}' - GitHub Runner ID '${runnerId}' - Not found on GitHub, treating as not busy`);
    return false;
  }
  logger.info(`Runner '${runner.id}' - GitHub Runner ID '${runnerId}' - Busy: ${state.busy}`);
  return state.busy;
}

async function listGitHubRunners(runner: RunnerInfo): Promise<GhRunners> {
  const key = runner.owner;
  const cachedRunners = githubCache.runners.get(key);
  if (cachedRunners) {
    logger.debug(`[listGithubRunners] Cache hit for ${key}`);
    return cachedRunners;
  }

  logger.debug(`[listGithubRunners] Cache miss for ${key}`);
  const client = await getOrCreateOctokit(runner);
  let runners;
  if (runner.type === 'Org') {
    runners = await client.paginate(client.actions.listSelfHostedRunnersForOrg, {
      org: runner.owner,
      per_page: 100,
    });
  } else {
    const [owner, repo] = runner.owner.split('/');
    runners = await client.paginate(client.actions.listSelfHostedRunnersForRepo, {
      owner,
      repo,
      per_page: 100,
    });
  }
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

async function deleteGitHubRunner(
  githubInstallationClient: Octokit,
  runner: RunnerInfo,
  ghRunnerId: number,
): Promise<{ ghRunnerId: number; status: number; success: boolean }> {
  try {
    let response;
    if (runner.type === 'Org') {
      response = await githubInstallationClient.actions.deleteSelfHostedRunnerFromOrg({
        runner_id: ghRunnerId,
        org: runner.owner,
      });
    } else {
      const [owner, repo] = runner.owner.split('/');
      response = await githubInstallationClient.actions.deleteSelfHostedRunnerFromRepo({
        runner_id: ghRunnerId,
        owner,
        repo,
      });
    }
    return { ghRunnerId, status: response.status, success: response.status === 204 };
  } catch (error) {
    logger.error(
      `Failed to de-register GitHub runner ${ghRunnerId} for runner '${runner.id}'. ` +
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      { error },
    );
    return { ghRunnerId, status: 0, success: false };
  }
}

async function removeRunner(
  runner: RunnerInfo,
  ghRunnerIds: number[],
  computeProvider: ScaleDownComputeProvider,
): Promise<void> {
  const githubInstallationClient = await getOrCreateOctokit(runner);
  try {
    if (runner.bypassRemoval) {
      logger.info(
        `Runner '${runner.id}' has bypass-removal tag set, skipping removal. Remove the tag to allow scale-down.`,
      );
      return;
    }

    const states = await Promise.all(
      ghRunnerIds.map(async (ghRunnerId) => {
        // Get busy state instead of using the output of listGitHubRunners(...) to minimize to race condition.
        return await getGitHubRunnerBusyState(githubInstallationClient, runner, ghRunnerId);
      }),
    );

    if (states.every((busy) => busy === false)) {
      const results = await Promise.all(
        ghRunnerIds.map((ghRunnerId) => deleteGitHubRunner(githubInstallationClient, runner, ghRunnerId)),
      );

      const allSucceeded = results.every((r) => r.success);
      const failedRunners = results.filter((r) => !r.success);

      if (allSucceeded) {
        await computeProvider.terminate(runner.id);
        logger.info(
          `${computeProvider.type.toUpperCase()} runner '${runner.id}' is terminated and GitHub runner is de-registered.`,
        );
      } else {
        // Only terminate the provider runner if it was successfully de-registered from GitHub.
        logger.error(
          `Failed to de-register ${failedRunners.length} GitHub runner(s) for runner '${runner.id}'. ` +
            `Runner will NOT be terminated to allow retry on next scale-down cycle. ` +
            `Failed runner IDs: ${failedRunners.map((r) => r.ghRunnerId).join(', ')}`,
        );
      }
    } else {
      logger.info(`Runner '${runner.id}' cannot be de-registered, because it is still busy.`);
    }
  } catch (e) {
    logger.error(
      `Runner '${runner.id}' cannot be de-registered. Error: ${e instanceof Error ? e.message : String(e)}`,
      { error: e },
    );
  }
}

async function evaluateAndRemoveRunners(
  runners: RunnerInfo[],
  scaleDownConfigs: ScalingDownConfigList,
  computeProvider: ScaleDownComputeProvider,
): Promise<void> {
  let idleCounter = getIdleRunnerCount(scaleDownConfigs);
  const evictionStrategy = getEvictionStrategy(scaleDownConfigs);
  const ownerTags = new Set(runners.map((runner) => runner.owner));

  for (const ownerTag of ownerTags) {
    const ownerRunners = runners
      .filter((runner) => runner.owner === ownerTag)
      .sort(evictionStrategy === 'oldest_first' ? oldestFirstStrategy : newestFirstStrategy);
    logger.debug(`Found: '${ownerRunners.length}' active GitHub runners with owner tag: '${ownerTag}'`);
    logger.debug(`Active GitHub runners with owner tag: '${ownerTag}': ${JSON.stringify(ownerRunners)}`);
    for (const runner of ownerRunners) {
      if (runner.bypassRemoval) {
        logger.debug(`Runner '${runner.id}' has bypass-removal tag set, skipping evaluation.`);
        continue;
      }
      const ghRunners = await listGitHubRunners(runner);
      const ghRunnersFiltered = ghRunners.filter((ghRunner: { name: string }) => ghRunner.name.endsWith(runner.id));
      logger.debug(`Found: '${ghRunnersFiltered.length}' GitHub runners for runner: '${runner.id}'`);
      logger.debug(`GitHub runners for runner: '${runner.id}': ${JSON.stringify(ghRunnersFiltered)}`);
      if (ghRunnersFiltered.length) {
        if (runnerMinimumTimeExceeded(runner)) {
          if (idleCounter > 0) {
            idleCounter--;
            logger.info(`Runner '${runner.id}' will be kept idle.`);
          } else {
            logger.info(`Terminating all non busy runners.`);
            await removeRunner(
              runner,
              ghRunnersFiltered.map((runner: { id: number }) => runner.id),
              computeProvider,
            );
          }
        }
      } else if (computeProvider.bootTimeExceeded(runner)) {
        await markOrphan(runner.id, computeProvider);
      } else {
        logger.debug(`Runner ${runner.id} has not yet booted.`);
      }
    }
  }
}

async function markOrphan(id: string, computeProvider: ScaleDownComputeProvider): Promise<void> {
  try {
    await computeProvider.markOrphan(id);
    logger.info(`Runner '${id}' tagged as orphan.`);
  } catch (e) {
    logger.error(`Failed to tag runner '${id}' as orphan.`, { error: e });
  }
}

async function unMarkOrphan(id: string, computeProvider: ScaleDownComputeProvider): Promise<void> {
  try {
    await computeProvider.unmarkOrphan(id);
    logger.info(`Runner '${id}' untagged as orphan.`);
  } catch (e) {
    logger.error(`Failed to un-tag runner '${id}' as orphan.`, { error: e });
  }
}

async function lastChanceCheckOrphanRunner(runner: RunnerInfo): Promise<boolean> {
  const client = await getOrCreateOctokit(runner);
  const runnerId = parseInt(runner.githubRunnerId || '0');
  const state = await getGitHubSelfHostedRunnerState(client, runner, runnerId);
  let isOrphan = false;

  if (state === null) {
    logger.debug(`Runner '${runner.id}' not found on GitHub, treating as orphaned.`);
    isOrphan = true;
  } else {
    logger.debug(`Runner '${runner.id}' is '${state.status}' and is currently '${state.busy ? 'busy' : 'idle'}'.`);
    const isOfflineAndBusy = state.status === 'offline' && state.busy;
    if (isOfflineAndBusy) {
      isOrphan = true;
    }
  }
  logger.info(`Runner '${runner.id}' is judged to ${isOrphan ? 'be' : 'not be'} orphaned.`);
  return isOrphan;
}

async function terminateOrphan(environment: string, computeProvider: ScaleDownComputeProvider): Promise<void> {
  try {
    const orphanRunners = await computeProvider.list(environment, true);

    for (const runner of orphanRunners) {
      if (runner.bypassRemoval) {
        logger.info(`Orphan runner '${runner.id}' has bypass-removal tag set, skipping termination.`);
        continue;
      }
      if (runner.githubRunnerId) {
        const isOrphan = await lastChanceCheckOrphanRunner(runner);
        if (isOrphan) {
          await computeProvider.terminate(runner.id);
        } else {
          await unMarkOrphan(runner.id, computeProvider);
        }
      } else {
        logger.info(`Terminating orphan runner '${runner.id}'`);
        await computeProvider.terminate(runner.id).catch((e) => {
          logger.error(`Failed to terminate orphan runner '${runner.id}'`, { error: e });
        });
      }
    }
  } catch (e) {
    logger.warn(`Failure during orphan termination processing.`, { error: e });
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

async function listRunners(environment: string, computeProvider: ScaleDownComputeProvider) {
  return await computeProvider.list(environment);
}

function filterRunners(runners: RunnerInfo[]): RunnerInfo[] {
  // Managed runners are launched with owner and type tags together. Exclude incomplete records because both
  // values are required to select the GitHub owner and runner API used during scale-down.
  return runners.filter((runner) => runner.owner && runner.type && !runner.orphan);
}

export async function scaleDown(): Promise<void> {
  githubCache.reset();
  const environment = process.env.ENVIRONMENT;
  const scaleDownConfigs = JSON.parse(process.env.SCALE_DOWN_CONFIG) as ScalingDownConfigList;
  const computeProviderType = resolveComputeProviderType(process.env.COMPUTE_PROVIDER_TYPE);
  const computeProvider = {
    ...controlPlaneProviderRegistry.capability(computeProviderType, 'scaleDown')(),
    type: computeProviderType,
  };

  // first runners marked to be orphan.
  await terminateOrphan(environment, computeProvider);

  // next scale down idle runners with respect to config and mark potential orphans
  const providerRunners = await listRunners(environment, computeProvider);
  const activeProviderRunnersCount = providerRunners.length;
  logger.info(
    `Found: '${activeProviderRunnersCount}' active ${computeProvider.type.toUpperCase()} runners before clean-up.`,
  );
  logger.debug(`Active ${computeProvider.type.toUpperCase()} runners: ${JSON.stringify(providerRunners)}`);

  if (activeProviderRunnersCount === 0) {
    logger.debug(`No active runners found for environment: '${environment}'`);
    return;
  }

  const runners = filterRunners(providerRunners);
  await evaluateAndRemoveRunners(runners, scaleDownConfigs, computeProvider);

  const activeProviderRunnersCountAfter = (await listRunners(environment, computeProvider)).length;
  logger.info(
    `Found: '${activeProviderRunnersCountAfter}' active ${computeProvider.type.toUpperCase()} runners after clean-up.`,
  );
}
