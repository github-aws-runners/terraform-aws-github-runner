import { Octokit } from '@octokit/rest';
import { Endpoints } from '@octokit/types';
import { RequestError } from '@octokit/request-error';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { resolveComputeProviderType } from '@aws-github-runner/compute-providers/provider-types';
import moment from 'moment';

import {
  createGithubAppAuth,
  createGithubInstallationAuth,
  createOctokitClient,
  getStoredInstallationId,
} from '../github/auth';
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
  const appIdx = ghAuthPre.appIndex;

  // Use the pre-configured installation ID when available (avoids an API call).
  let installationId = await getStoredInstallationId(appIdx);
  if (installationId === undefined) {
    const githubClientPre = await createOctokitClient(ghAuthPre.token, ghesApiUrl, appIdx);
    installationId =
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
  }
  const ghAuth = await createGithubInstallationAuth(installationId, ghesApiUrl, appIdx);
  const octokit = await createOctokitClient(ghAuth.token, ghesApiUrl, appIdx);
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

function hasGitHubRunnerId(runner: RunnerInfo): boolean {
  return /^[1-9]\d*$/.test(runner.githubRunnerId ?? '') && Number.isSafeInteger(Number(runner.githubRunnerId));
}

class UnverifiableRunnerError extends Error {}

async function listGitHubRunners(runner: RunnerInfo, computeProvider: ScaleDownComputeProvider): Promise<GhRunners> {
  if (computeProvider.listPage && !hasGitHubRunnerId(runner) && runner.githubRunnerName === undefined) {
    throw new UnverifiableRunnerError(`Runner '${runner.id}' has no trusted GitHub identity; retaining instance`);
  }
  const client = await getOrCreateOctokit(runner);
  if (hasGitHubRunnerId(runner)) {
    const state = await getGitHubSelfHostedRunnerState(client, runner, Number(runner.githubRunnerId));
    return state ? [state] : [];
  }
  if (runner.githubRunnerName !== undefined) {
    const owner =
      runner.type === 'Org'
        ? { org: runner.owner }
        : {
            owner: runner.owner.split('/')[0],
            repo: runner.owner.split('/')[1],
          };
    const method =
      runner.type === 'Org' ? client.actions.listSelfHostedRunnersForOrg : client.actions.listSelfHostedRunnersForRepo;
    const matches = await client.paginate(method, { ...owner, name: runner.githubRunnerName, per_page: 100 });
    if (matches.length > 0) return matches;
    // Custom start scripts may register another name. A filtered miss alone
    // cannot prove that this instance has no live (possibly busy) registration.
    if (computeProvider.listPage) {
      throw new UnverifiableRunnerError(`Runner '${runner.id}' was not found by expected name; retaining instance`);
    }
  }
  if (!computeProvider.listPage) {
    // Preserve the legacy provider contract. Cache only a complete successful
    // listing; a failed/partial lookup must never establish absence.
    const key = `${runner.type}:${runner.owner}`;
    const cached = githubCache.runners.get(key);
    if (cached) return cached;
    const runners =
      runner.type === 'Org'
        ? await client.paginate(client.actions.listSelfHostedRunnersForOrg, { org: runner.owner, per_page: 100 })
        : await client.paginate(client.actions.listSelfHostedRunnersForRepo, {
            owner: runner.owner.split('/')[0],
            repo: runner.owner.split('/')[1],
            per_page: 100,
          });
    githubCache.runners.set(key, runners);
    return runners;
  }
  // Without either identity we cannot establish absence with a bounded query.
  // Do not let a legacy/incomplete record force an organization-wide inventory
  // before other instances can be cleaned up.
  throw new UnverifiableRunnerError(
    `Runner '${runner.id}' has no GitHub ID or complete runner name; retaining instance`,
  );
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

function idleConfirmationSeconds(): number {
  const raw = process.env.SCALE_DOWN_IDLE_CONFIRMATION_SECONDS;
  const parsed = raw === undefined || raw === '' ? 0 : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

// GitHub's busy flag can be stale: it reads false for runners that are actively executing
// a job, both shortly after job assignment (observed 25-60s lag) and deep into a running
// job (observed 12+ minutes). See #5085. A single busy=false reading is therefore not
// sufficient evidence that a runner is idle. When SCALE_DOWN_IDLE_CONFIRMATION_SECONDS > 0,
// require busy=false readings spanning at least that window before terminating; any
// busy=true reading in between resets the window (see clearIdleDetection).
async function idleConfirmed(runner: RunnerInfo, computeProvider: ScaleDownComputeProvider): Promise<boolean> {
  const confirmationSeconds = idleConfirmationSeconds();
  if (confirmationSeconds === 0) {
    return true;
  }
  const idleDetectedAt = runner.idleDetectedAt;
  const idleForSeconds = idleDetectedAt ? (Date.now() - Date.parse(idleDetectedAt)) / 1000 : NaN;
  if (Number.isNaN(idleForSeconds)) {
    // No marker yet, or an unparsable one: (re)start the confirmation window.
    await computeProvider.markIdle(runner.id, new Date().toISOString());
    logger.info(
      `Runner '${runner.id}' reads idle; deferring termination for at least ` +
        `${confirmationSeconds}s to confirm the busy state is not stale.`,
    );
    return false;
  }
  if (idleForSeconds < confirmationSeconds) {
    logger.info(
      `Runner '${runner.id}' reads idle since '${idleDetectedAt}' ` +
        `(${Math.round(idleForSeconds)}s < ${confirmationSeconds}s); deferring termination.`,
    );
    return false;
  }
  logger.info(
    `Runner '${runner.id}' confirmed idle since '${idleDetectedAt}' ` +
      `(${Math.round(idleForSeconds)}s >= ${confirmationSeconds}s).`,
  );
  return true;
}

async function clearIdleDetection(runner: RunnerInfo, computeProvider: ScaleDownComputeProvider): Promise<void> {
  if (idleConfirmationSeconds() === 0) {
    return;
  }
  if (runner.idleDetectedAt) {
    await computeProvider.unmarkIdle(runner.id);
    logger.info(`Runner '${runner.id}' is busy again; idle-detection window reset.`);
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
      if (!(await idleConfirmed(runner, computeProvider))) {
        return;
      }
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
      await clearIdleDetection(runner, computeProvider);
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
  sweep = { idleRemaining: getIdleRunnerCount(scaleDownConfigs) },
  remainingTime = () => Infinity,
): Promise<void> {
  let idleCounter = sweep.idleRemaining;
  const evictionStrategy = getEvictionStrategy(scaleDownConfigs);
  const ownerTags = new Set(runners.map((runner) => runner.owner));

  for (const ownerTag of ownerTags) {
    const ownerRunners = runners
      .filter((runner) => runner.owner === ownerTag)
      .sort(evictionStrategy === 'oldest_first' ? oldestFirstStrategy : newestFirstStrategy);
    logger.debug(`Found: '${ownerRunners.length}' active GitHub runners with owner tag: '${ownerTag}'`);
    logger.debug(`Active GitHub runners with owner tag: '${ownerTag}': ${JSON.stringify(ownerRunners)}`);
    for (const runner of ownerRunners) {
      if (remainingTime() < 10000) return;
      try {
        if (runner.bypassRemoval) {
          logger.debug(`Runner '${runner.id}' has bypass-removal tag set, skipping evaluation.`);
          continue;
        }
        const ghRunners = await listGitHubRunners(runner, computeProvider);
        const ghRunnersFiltered = ghRunners.filter((ghRunner: { name: string }) => ghRunner.name.endsWith(runner.id));
        logger.debug(`Found: '${ghRunnersFiltered.length}' GitHub runners for runner: '${runner.id}'`);
        logger.debug(`GitHub runners for runner: '${runner.id}': ${JSON.stringify(ghRunnersFiltered)}`);
        if (ghRunnersFiltered.length) {
          if (runnerMinimumTimeExceeded(runner)) {
            if (idleCounter > 0) {
              idleCounter--;
              sweep.idleRemaining = idleCounter;
              // A runner kept idle is not evaluated for removal, so its idle marker cannot be
              // refreshed by busy readings. Clear it so a later evaluation starts a fresh window.
              await clearIdleDetection(runner, computeProvider);
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
      } catch (error) {
        if (error instanceof UnverifiableRunnerError) {
          logger.error(error.message, { code: 'UNVERIFIABLE_RUNNER', runnerId: runner.id, owner: runner.owner });
        } else logger.warn(`Failed to evaluate runner '${runner.id}'; continuing cleanup.`, { error });
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

async function terminateOrphan(
  environment: string,
  computeProvider: ScaleDownComputeProvider,
  page?: RunnerInfo[],
  remainingTime = () => Infinity,
): Promise<void> {
  let orphanRunners: RunnerInfo[];
  try {
    orphanRunners = page ?? (await computeProvider.list(environment, true));
  } catch (error) {
    logger.warn('Failed to list orphan runners.', { error });
    return;
  }

  for (const runner of orphanRunners) {
    if (remainingTime() < 10000) return;
    if (runner.bypassRemoval) {
      logger.info(`Orphan runner '${runner.id}' has bypass-removal tag set, skipping termination.`);
      continue;
    }
    if (!runner.owner || !runner.type) {
      logger.error(`Cannot verify orphan runner '${runner.id}' without its owner and type, skipping termination.`, {
        code: 'UNVERIFIABLE_RUNNER',
        runnerId: runner.id,
      });
      continue;
    }
    try {
      // A runner can register after it was marked orphan, even if writing its
      // registration ID back to the compute provider failed. Check GitHub again.
      const isOrphan = hasGitHubRunnerId(runner)
        ? await lastChanceCheckOrphanRunner(runner)
        : !(await listGitHubRunners(runner, computeProvider)).some((registered) => registered.name.endsWith(runner.id));
      if (isOrphan) {
        logger.info(`Terminating orphan runner '${runner.id}'.`);
        await computeProvider.terminate(runner.id);
      } else {
        await unMarkOrphan(runner.id, computeProvider);
      }
    } catch (error) {
      // Leave this runner for a later invocation without blocking other owners
      // or runners when one GitHub request or provider termination fails.
      if (error instanceof UnverifiableRunnerError) {
        logger.error(error.message, { code: 'UNVERIFIABLE_RUNNER', runnerId: runner.id, owner: runner.owner });
      } else logger.warn(`Failed to process orphan runner '${runner.id}'.`, { error });
    }
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

export async function scaleDown(remainingTime = () => Infinity): Promise<void> {
  githubCache.reset();
  const readRemainingTime = remainingTime;
  let stoppedForDeadline = false;
  remainingTime = () => {
    const remaining = readRemainingTime();
    if (remaining < 10000 && !stoppedForDeadline) {
      stoppedForDeadline = true;
      logger.info('Stopping scale-down before the Lambda deadline; remaining work will be rediscovered next run.', {
        remainingTimeMs: remaining,
      });
    }
    return remaining;
  };
  const environment = process.env.ENVIRONMENT;
  const scaleDownConfigs = JSON.parse(process.env.SCALE_DOWN_CONFIG) as ScalingDownConfigList;
  const computeProviderType = resolveComputeProviderType(process.env.COMPUTE_PROVIDER_TYPE);
  const computeProvider = {
    ...controlPlaneProviderRegistry.capability(computeProviderType, 'scaleDown')(),
    type: computeProviderType,
  };

  if (computeProvider.listPage) {
    const sweep = { idleRemaining: getIdleRunnerCount(scaleDownConfigs) };
    let pages = 0;
    let scannedRunners = 0;
    let terminatedRunners = 0;
    let completed = false;
    const terminate = computeProvider.terminate;
    computeProvider.terminate = async (id) => {
      await terminate(id);
      terminatedRunners++;
    };
    let nextToken: string | undefined;
    try {
      do {
        if (remainingTime() < 10000) return;
        const page = await computeProvider.listPage(environment, nextToken);
        pages++;
        scannedRunners += page.runners.length;
        logger.info(
          `Found: '${page.runners.length}' ${computeProvider.type.toUpperCase()} runners in inventory page.`,
          { page: pages, activeRunners: filterRunners(page.runners).length },
        );
        await terminateOrphan(
          environment,
          computeProvider,
          page.runners.filter((runner) => runner.orphan),
          remainingTime,
        );
        await evaluateAndRemoveRunners(
          filterRunners(page.runners),
          scaleDownConfigs,
          computeProvider,
          sweep,
          remainingTime,
        );
        nextToken = page.nextToken;
      } while (nextToken);
      completed = !stoppedForDeadline;
    } finally {
      logger.info('Scale-down inventory scan finished.', {
        provider: computeProvider.type,
        pages,
        scannedRunners,
        terminatedRunners,
        completed,
        stoppedForDeadline,
      });
    }
    return;
  }

  // first runners marked to be orphan.
  await terminateOrphan(environment, computeProvider, undefined, remainingTime);

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
  await evaluateAndRemoveRunners(runners, scaleDownConfigs, computeProvider, undefined, remainingTime);

  const activeProviderRunnersCountAfter = (await listRunners(environment, computeProvider)).length;
  logger.info(
    `Found: '${activeProviderRunnersCountAfter}' active ${computeProvider.type.toUpperCase()} runners after clean-up.`,
  );
}
