import { Octokit } from '@octokit/rest';
import { Endpoints } from '@octokit/types';
import { RequestError } from '@octokit/request-error';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { resolveComputeProviderType } from '@aws-github-runner/compute-providers/provider-types';
import {
  getRunnerStateStore,
  type RunnerStateRecord,
  type RunnerStateStore,
} from '@aws-github-runner/storage-providers';
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
type GitHubRunnerState = OrgRunnerList[number] | RepoRunnerList[number];

interface InventoryRunnerInfo extends RunnerInfo {
  inventory?: RunnerStateRecord;
  providerPresent?: boolean;
}

type RestorableRunnerState = Parameters<RunnerStateStore['cancelTermination']>[1];

interface TerminationClaim {
  runnerStateId?: string;
  restoreState?: RestorableRunnerState;
}

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
    const githubClientPre = await createOctokitClient(ghAuthPre.token, ghesApiUrl);
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
  const octokit = await createOctokitClient(ghAuth.token, ghesApiUrl);
  githubCache.clients.set(key, octokit);

  return octokit;
}

async function getGitHubSelfHostedRunnerState(
  client: Octokit,
  runner: RunnerInfo,
  runnerId: number,
): Promise<GitHubRunnerState | null> {
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
    if (error instanceof RequestError && error.status === 404) {
      logger.info(
        `GitHub runner ${ghRunnerId} for runner '${runner.id}' is already de-registered; treating cleanup as complete.`,
      );
      return { ghRunnerId, status: error.status, success: true };
    }
    logger.error(
      `Failed to de-register GitHub runner ${ghRunnerId} for runner '${runner.id}'. ` +
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      { error },
    );
    return { ghRunnerId, status: 0, success: false };
  }
}

async function removeRunner(
  runner: InventoryRunnerInfo,
  ghRunnerIds: number[],
  computeProvider: ScaleDownComputeProvider,
): Promise<void> {
  let terminationClaim: TerminationClaim | undefined;
  let computeTerminated = false;
  try {
    if (runner.bypassRemoval) {
      logger.info(
        `Runner '${runner.id}' has bypass-removal tag set, skipping removal. Remove the tag to allow scale-down.`,
      );
      return;
    }

    const githubInstallationClient = await getOrCreateOctokit(runner);
    const states = await Promise.all(
      ghRunnerIds.map(async (ghRunnerId) => {
        // Get busy state instead of using the output of listGitHubRunners(...) to minimize to race condition.
        return await getGitHubRunnerBusyState(githubInstallationClient, runner, ghRunnerId);
      }),
    );

    if (states.every((busy) => busy === false)) {
      const claim = await beginRunnerTermination(runner);
      if (claim === undefined) {
        logger.info(`Runner '${runner.id}' is already being reconciled; skipping this scale-down cycle.`);
        return;
      }
      terminationClaim = claim;

      const results = await Promise.all(
        ghRunnerIds.map((ghRunnerId) => deleteGitHubRunner(githubInstallationClient, runner, ghRunnerId)),
      );

      const allSucceeded = results.every((r) => r.success);
      const failedRunners = results.filter((r) => !r.success);

      if (allSucceeded) {
        await computeProvider.terminate(runner.id);
        computeTerminated = true;
        await completeRunnerTermination(terminationClaim);
        terminationClaim = undefined;
        logger.info(
          `${computeProvider.type.toUpperCase()} runner '${runner.id}' is terminated and GitHub runner is de-registered.`,
        );
      } else {
        await restoreRunnerTermination(terminationClaim);
        terminationClaim = undefined;
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
    if (terminationClaim && !computeTerminated) {
      await restoreRunnerTermination(terminationClaim);
    }
    logger.error(
      `Runner '${runner.id}' cannot be de-registered. Error: ${e instanceof Error ? e.message : String(e)}`,
      { error: e },
    );
  }
}

async function evaluateAndRemoveRunners(
  runners: InventoryRunnerInfo[],
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
    if (ownerRunners.some((runner) => runner.inventory)) {
      logger.debug(`Active GitHub runner inventory with owner tag: '${ownerTag}'`, {
        runners: ownerRunners.map((runner) => ({
          computeResourceId: runner.id,
          lifecycleState: runner.inventory?.state,
        })),
      });
    } else {
      logger.debug(`Active GitHub runners with owner tag: '${ownerTag}': ${JSON.stringify(ownerRunners)}`);
    }
    for (const runner of ownerRunners) {
      if (runner.bypassRemoval) {
        logger.debug(`Runner '${runner.id}' has bypass-removal tag set, skipping evaluation.`);
        continue;
      }
      const ghRunners = await listGitHubRunners(runner);
      const ghRunnersFiltered = ghRunners.filter((ghRunner: { id: number; name: string }) =>
        runner.inventory?.githubRunnerId
          ? ghRunner.id.toString() === runner.inventory.githubRunnerId
          : ghRunner.name.endsWith(runner.id),
      );
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
        await markOrphan(runner, computeProvider);
      } else {
        logger.debug(`Runner ${runner.id} has not yet booted.`);
      }
    }
  }
}

async function markOrphan(runner: InventoryRunnerInfo, computeProvider: ScaleDownComputeProvider): Promise<void> {
  try {
    if (runner.inventory) {
      await getRunnerStateStore()?.markOrphan(runner.inventory.runnerId);
    }
    await computeProvider.markOrphan(runner.id);
    logger.info(`Runner '${runner.id}' tagged as orphan.`);
  } catch (e) {
    logger.error(`Failed to tag runner '${runner.id}' as orphan.`, { error: e });
  }
}

async function unMarkOrphan(runner: InventoryRunnerInfo, computeProvider: ScaleDownComputeProvider): Promise<void> {
  try {
    // Keep the durable lifecycle unchanged if the provider mutation fails. In
    // particular, activating a provisioning record removes its safety TTL.
    await computeProvider.unmarkOrphan(runner.id);
    const runnerStateStore = getRunnerStateStore();
    if (runnerStateStore && runner.inventory?.state === 'orphan') {
      await runnerStateStore.unmarkOrphan(runner.inventory.runnerId);
    } else if (runnerStateStore && runner.inventory?.state === 'provisioning') {
      await runnerStateStore.activate(runner.inventory.runnerId, {
        githubRunnerId: runner.githubRunnerId,
        runnerLabels: runner.inventory.runnerLabels,
        runnerName: runner.inventory.runnerName,
        metadata: runner.inventory.metadata,
      });
    }
    logger.info(`Runner '${runner.id}' untagged as orphan.`);
  } catch (e) {
    logger.error(`Failed to un-tag runner '${runner.id}' as orphan.`, { error: e });
  }
}

interface OrphanEvaluation {
  isOrphan: boolean;
  githubRunnerExists: boolean;
}

async function lastChanceCheckOrphanRunner(runner: InventoryRunnerInfo): Promise<OrphanEvaluation> {
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
  return { isOrphan, githubRunnerExists: state !== null };
}

async function terminateOrphan(
  environment: string,
  computeProvider: ScaleDownComputeProvider,
  runners?: InventoryRunnerInfo[],
): Promise<void> {
  try {
    const orphanRunners: InventoryRunnerInfo[] = runners ?? (await computeProvider.list(environment, true));

    for (const runner of orphanRunners) {
      if (runner.bypassRemoval) {
        logger.info(`Orphan runner '${runner.id}' has bypass-removal tag set, skipping termination.`);
        continue;
      }
      if (runner.inventory?.state === 'provisioning' && !computeProvider.bootTimeExceeded(runner)) {
        logger.debug(`Runner '${runner.id}' is still provisioning; skipping reconciliation until boot time expires.`);
        continue;
      }
      if (runner.githubRunnerId) {
        const orphanEvaluation = await lastChanceCheckOrphanRunner(runner);
        if (orphanEvaluation.isOrphan) {
          if (runner.inventory) {
            await terminateClaimedRunner(
              runner,
              computeProvider,
              orphanEvaluation.githubRunnerExists ? parseInt(runner.githubRunnerId) : undefined,
            );
          } else {
            // Preserve the provider-only recovery behavior used by the legacy path.
            await computeProvider.terminate(runner.id);
          }
        } else {
          await unMarkOrphan(runner, computeProvider);
        }
      } else {
        logger.info(`Terminating orphan runner '${runner.id}'`);
        if (runner.inventory) {
          await terminateClaimedRunner(runner, computeProvider);
        } else {
          // Preserve the provider-only recovery behavior used by the legacy path.
          await computeProvider.terminate(runner.id).catch((error) => {
            logger.error(`Failed to terminate orphan runner '${runner.id}'`, { error });
          });
        }
      }
    }
  } catch (e) {
    logger.warn(`Failure during orphan termination processing.`, { error: e });
  }
}

async function terminateClaimedRunner(
  runner: InventoryRunnerInfo,
  computeProvider: ScaleDownComputeProvider,
  githubRunnerId?: number,
): Promise<void> {
  const claim = await beginRunnerTermination(runner);
  if (claim === undefined) {
    logger.info(`Runner '${runner.id}' is already being reconciled; skipping this scale-down cycle.`);
    return;
  }

  try {
    if (githubRunnerId !== undefined) {
      const githubInstallationClient = await getOrCreateOctokit(runner);
      const result = await deleteGitHubRunner(githubInstallationClient, runner, githubRunnerId);
      if (!result.success) {
        await restoreRunnerTermination(claim);
        logger.error(
          `Failed to de-register GitHub runner '${githubRunnerId}' for orphan runner '${runner.id}'. ` +
            `Runner will NOT be terminated to allow retry on next scale-down cycle.`,
        );
        return;
      }
    }
    await computeProvider.terminate(runner.id);
  } catch (error) {
    await restoreRunnerTermination(claim);
    logger.error(`Failed to clean up orphan runner '${runner.id}'`, { error });
    return;
  }

  try {
    await completeRunnerTermination(claim);
  } catch (error) {
    logger.error(`Failed to delete runner state for terminated runner '${runner.id}'`, { error });
  }
}

async function reconcileProviderAbsentRunner(
  runner: InventoryRunnerInfo,
  computeProvider: ScaleDownComputeProvider,
): Promise<void> {
  if (!runner.inventory || runner.providerPresent !== false) {
    return;
  }

  // Provider discovery can lag immediately after launch. Retain the inventory
  // until the normal boot grace has elapsed before declaring compute absent.
  if (!computeProvider.bootTimeExceeded(runner)) {
    logger.debug(`Runner '${runner.id}' is absent from provider discovery but remains inside its boot grace.`);
    return;
  }

  const claim = await beginRunnerTermination(runner);
  if (claim === undefined) {
    logger.info(`Runner '${runner.id}' is already being reconciled; skipping this scale-down cycle.`);
    return;
  }

  try {
    if (runner.githubRunnerId) {
      const githubInstallationClient = await getOrCreateOctokit(runner);
      const result = await deleteGitHubRunner(githubInstallationClient, runner, parseInt(runner.githubRunnerId, 10));
      if (!result.success) {
        await restoreRunnerTermination(claim);
        logger.error(
          `Failed to de-register GitHub runner '${runner.githubRunnerId}' for provider-absent runner ` +
            `'${runner.id}'. Runner state will be retained for retry.`,
        );
        return;
      }
    }
  } catch (error) {
    await restoreRunnerTermination(claim);
    logger.error(`Failed to reconcile GitHub state for provider-absent runner '${runner.id}'`, { error });
    return;
  }

  // Provider discovery already established that the compute resource is gone;
  // avoid tag/terminate calls that would turn idempotent cleanup into a retry loop.
  try {
    await completeRunnerTermination(claim);
    logger.info(`Removed durable state for provider-absent runner '${runner.id}'.`);
  } catch (error) {
    // GitHub cleanup is committed at this point. Leave the terminating claim in
    // place so its lease/TTL makes state deletion retryable without resurrection.
    logger.error(`Failed to delete runner state for provider-absent runner '${runner.id}'`, { error });
  }
}

async function beginRunnerTermination(runner: InventoryRunnerInfo): Promise<TerminationClaim | undefined> {
  if (!runner.inventory) {
    return {};
  }

  const runnerStateStore = getRunnerStateStore();
  if (!runnerStateStore) {
    return {};
  }

  const previousState = await runnerStateStore.beginTermination(runner.inventory.runnerId);
  if (previousState === undefined) {
    return undefined;
  }
  return {
    runnerStateId: runner.inventory.runnerId,
    // A reclaimed terminating record has no known pre-claim lifecycle state.
    // Leave it terminating on failure so the lease can make it retryable again.
    ...(previousState === 'terminating' ? {} : { restoreState: previousState }),
  };
}

async function restoreRunnerTermination(claim: TerminationClaim): Promise<void> {
  if (!claim.runnerStateId || !claim.restoreState) {
    return;
  }

  try {
    await getRunnerStateStore()?.cancelTermination(claim.runnerStateId, claim.restoreState);
  } catch (error) {
    logger.error(`Failed to restore runner state for '${claim.runnerStateId}' after termination failure.`, { error });
  }
}

async function completeRunnerTermination(claim: TerminationClaim): Promise<void> {
  if (claim.runnerStateId) {
    await getRunnerStateStore()?.delete(claim.runnerStateId);
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

function filterRunners(runners: InventoryRunnerInfo[]): InventoryRunnerInfo[] {
  // Managed runners are launched with owner and type tags together. Exclude incomplete records because both
  // values are required to select the GitHub owner and runner API used during scale-down.
  return runners.filter((runner) => runner.owner && runner.type && !runner.orphan);
}

function mergeRunnerInventory(records: RunnerStateRecord[], providerRunners: RunnerInfo[]): InventoryRunnerInfo[] {
  const runnersByComputeResource = new Map<string, InventoryRunnerInfo>();
  for (const record of records) {
    runnersByComputeResource.set(record.computeResourceId, {
      id: record.computeResourceId,
      launchTime: new Date(record.createdAt),
      owner: record.runnerOwner,
      type: record.runnerType,
      orphan: record.state !== 'active',
      githubRunnerId: record.githubRunnerId,
      inventory: record,
      providerPresent: false,
    });
  }

  for (const providerRunner of providerRunners) {
    const storedRunner = runnersByComputeResource.get(providerRunner.id);
    if (!storedRunner) {
      runnersByComputeResource.set(providerRunner.id, { ...providerRunner, providerPresent: true });
      continue;
    }

    runnersByComputeResource.set(providerRunner.id, {
      ...storedRunner,
      ...providerRunner,
      id: storedRunner.id,
      owner: storedRunner.owner,
      type: storedRunner.type,
      // Lifecycle state is canonical for tracked resources. Provider tags are
      // retained as recovery data only for resources missing from inventory.
      orphan: storedRunner.orphan,
      githubRunnerId: storedRunner.githubRunnerId ?? providerRunner.githubRunnerId,
      inventory: storedRunner.inventory,
      providerPresent: true,
    });
  }

  return Array.from(runnersByComputeResource.values());
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
  const runnerStateStore = getRunnerStateStore();
  let managedRunners: InventoryRunnerInfo[];
  let runnersToEvaluate: InventoryRunnerInfo[];

  if (!runnerStateStore) {
    // Preserve the legacy SSM-backed lifecycle. EC2 remains the source of truth
    // when no durable runner inventory is configured.
    await terminateOrphan(environment, computeProvider);
    managedRunners = await listRunners(environment, computeProvider);
    runnersToEvaluate = managedRunners;
  } else {
    const providerRunners = await listRunners(environment, computeProvider);
    const inventoryRecords = await runnerStateStore.list({ computeProvider: computeProvider.type });
    managedRunners = mergeRunnerInventory(inventoryRecords, providerRunners);

    const providerAbsentRunners = managedRunners.filter(
      (runner) => runner.inventory !== undefined && runner.providerPresent === false,
    );
    for (const runner of providerAbsentRunners) {
      await reconcileProviderAbsentRunner(runner, computeProvider);
    }
    runnersToEvaluate = managedRunners.filter(
      (runner) => runner.inventory === undefined || runner.providerPresent !== false,
    );

    // Reconcile stale provisioning and orphan records first. Provider tags remain
    // a recovery signal for resources that predate the durable inventory.
    await terminateOrphan(
      environment,
      computeProvider,
      runnersToEvaluate.filter((runner) => runner.orphan),
    );
  }

  const runnerCountLabel = runnerStateStore ? 'managed' : 'active';
  const managedRunnerCount = managedRunners.length;
  logger.info(
    `Found: '${managedRunnerCount}' ${runnerCountLabel} ${computeProvider.type.toUpperCase()} runners before clean-up.`,
  );
  if (runnerStateStore) {
    logger.debug(`Active ${computeProvider.type.toUpperCase()} runner inventory`, {
      runners: managedRunners.map((runner) => ({
        computeResourceId: runner.id,
        lifecycleState: runner.inventory?.state,
      })),
    });
  } else {
    logger.debug(`Active ${computeProvider.type.toUpperCase()} runners: ${JSON.stringify(managedRunners)}`);
  }

  if (managedRunnerCount === 0) {
    logger.debug(`No ${runnerCountLabel} runners found for environment: '${environment}'`);
    return;
  }

  const runners = filterRunners(runnersToEvaluate);
  await evaluateAndRemoveRunners(runners, scaleDownConfigs, computeProvider);

  const providerRunnersAfter = await listRunners(environment, computeProvider);
  const managedRunnerCountAfter = runnerStateStore
    ? mergeRunnerInventory(await runnerStateStore.list({ computeProvider: computeProvider.type }), providerRunnersAfter)
        .length
    : providerRunnersAfter.length;
  logger.info(
    `Found: '${managedRunnerCountAfter}' ${runnerCountLabel} ${computeProvider.type.toUpperCase()} runners after clean-up.`,
  );
}
