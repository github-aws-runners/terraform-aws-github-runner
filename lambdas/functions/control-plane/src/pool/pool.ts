import { Octokit } from '@octokit/rest';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { resolveComputeProviderType } from '@aws-github-runner/compute-providers/provider-types';
import { getRunnerStateStore, type RunnerStateRecord } from '@aws-github-runner/storage-providers';
import yn from 'yn';

import {
  createGithubAppAuth,
  createGithubInstallationAuth,
  createOctokitClient,
  getStoredInstallationId,
} from '../github/auth';
import { controlPlaneProviderRegistry } from '../control-plane-providers';
import { getGitHubEnterpriseApiUrl } from '../scale-runners/github-runner';
import type { RunnerStatus } from './pool-provider';

const logger = createChildLogger('pool');

export interface PoolEvent {
  poolSize: number;
  type?: string;
}

export async function adjust(event: PoolEvent): Promise<void> {
  const computeProviderType = resolveComputeProviderType(event.type);
  const computeProvider = {
    ...controlPlaneProviderRegistry.capability(computeProviderType, 'pool')(),
    type: computeProviderType,
  };
  logger.info(`Checking current ${computeProvider.type} pool size against pool of size: ${event.poolSize}`);
  const runnerLabels = process.env.RUNNER_LABELS || '';
  const runnerGroup = process.env.RUNNER_GROUP_NAME || '';
  const runnerNamePrefix = process.env.RUNNER_NAME_PREFIX || '';
  const environment = process.env.ENVIRONMENT;
  const ephemeral = yn(process.env.ENABLE_EPHEMERAL_RUNNERS, { default: false });
  const enableJitConfig = yn(process.env.ENABLE_JIT_CONFIG, { default: ephemeral });
  const disableAutoUpdate = yn(process.env.DISABLE_RUNNER_AUTOUPDATE, { default: false });
  const runnerOwner = process.env.RUNNER_OWNER;
  // -1 disables the maximum check, matching the scale-up lambda's semantics. Defaults to unlimited
  // when unset so the pool keeps its previous behavior on stacks that do not provide the variable.
  const maximumRunners = parseInt(process.env.RUNNERS_MAXIMUM_COUNT || '-1');
  const includeBusyRunners = yn(process.env.INCLUDE_BUSY_RUNNERS, { default: false });

  const { ghesApiUrl, ghesBaseUrl } = getGitHubEnterpriseApiUrl();

  // Select one GitHub App for this entire invocation so every API call draws
  // from the same rate-limit bucket.
  const ghAppAuth = await createGithubAppAuth(undefined, ghesApiUrl);
  const appIdx = ghAppAuth.appIndex;

  const installationId = await getInstallationId(ghAppAuth.token, ghesApiUrl, runnerOwner, appIdx);
  const ghAuth = await createGithubInstallationAuth(installationId, ghesApiUrl, appIdx);
  const githubInstallationClient = await createOctokitClient(ghAuth.token, ghesApiUrl);

  // Get statuses of runners registered in GitHub
  const runnerStatusses = await getGitHubRegisteredRunnnerStatusses(
    githubInstallationClient,
    runnerOwner,
    runnerNamePrefix,
  );

  const runnerStateStore = getRunnerStateStore();
  let currentRunnerCount: number;
  let numberOfRunnersInPool: number;
  const providerRunners = await computeProvider.listRunners({
    environment,
    runnerOwner,
    runnerType: 'Org',
  });
  if (runnerStateStore) {
    const runnerStates = (await runnerStateStore.list({ computeProvider: computeProvider.type })).filter(
      (record) => record.runnerOwner === runnerOwner && record.runnerType === 'Org',
    );
    const storedComputeResourceIds = new Set(runnerStates.map((record) => record.computeResourceId));
    const untrackedProviderRunners = providerRunners.filter((runner) => !storedComputeResourceIds.has(runner.id));
    // Inventory is canonical for tracked resources. Provider discovery contributes
    // only untracked resources so a launch-before-state crash cannot over-provision.
    currentRunnerCount = runnerStates.length + untrackedProviderRunners.length;
    numberOfRunnersInPool =
      countAvailableStoredRunners(runnerStates, runnerStatusses, includeBusyRunners) +
      computeProvider.countAvailableRunners(untrackedProviderRunners, runnerStatusses, includeBusyRunners);
  } else {
    // Look up the managed provider runners, but running does not mean idle.
    currentRunnerCount = providerRunners.length;
    numberOfRunnersInPool = computeProvider.countAvailableRunners(providerRunners, runnerStatusses, includeBusyRunners);
  }
  let topUp = event.poolSize - numberOfRunnersInPool;

  // The pool must never push the total number of runners (busy + idle) past the configured maximum.
  // currentRunnerCount includes both canonical inventory and untracked provider recovery records. Without
  // this clamp the pool keeps topping up against idle-only counts and can overshoot runners_maximum_count,
  // while the scale-up lambda correctly refuses to launch.
  if (maximumRunners !== -1 && topUp > 0) {
    const headroom = maximumRunners - currentRunnerCount;
    if (topUp > headroom) {
      logger.info(
        `Capping pool top-up from ${topUp} to ${Math.max(headroom, 0)} to respect the maximum of ` +
          `${maximumRunners} runners (currently ${currentRunnerCount} running).`,
      );
      topUp = headroom;
    }
  }

  if (topUp > 0) {
    logger.info(`The pool will be topped up with ${topUp} runners.`);
    await computeProvider.createRunners({
      githubRunnerConfig: {
        appIndex: appIdx,
        ephemeral,
        enableJitConfig,
        ghesBaseUrl,
        runnerLabels,
        runnerGroup,
        runnerOwner,
        runnerNamePrefix,
        runnerType: 'Org',
        disableAutoUpdate: disableAutoUpdate,
      },
      numberOfRunners: topUp,
      githubInstallationClient,
    });
  } else {
    logger.info(`Pool will not be topped up. Found ${numberOfRunnersInPool} managed idle runners.`);
  }
}

function countAvailableStoredRunners(
  runnerStates: RunnerStateRecord[],
  runnerStatuses: Map<string, RunnerStatus>,
  includeBusyRunners: boolean,
): number {
  let available = 0;
  for (const runner of runnerStates) {
    if (runner.state === 'orphan' || runner.state === 'terminating') {
      continue;
    }

    const status = runnerStatuses.get(runner.computeResourceId);
    if ((status?.busy === false || includeBusyRunners) && status?.status === 'online') {
      available++;
    } else if (status === undefined && !runnerBootTimeExceeded(runner.createdAt)) {
      available++;
    }
  }
  return available;
}

function runnerBootTimeExceeded(createdAt: string): boolean {
  const bootTimeMinutes = Number(process.env.RUNNER_BOOT_TIME_IN_MINUTES);
  const launchTime = new Date(createdAt).getTime();
  return launchTime + bootTimeMinutes * 60_000 < Date.now();
}

async function getInstallationId(appToken: string, ghesApiUrl: string, org: string, appIndex: number): Promise<number> {
  // Use the pre-configured installation ID when available (avoids an API call).
  const storedId = await getStoredInstallationId(appIndex);
  if (storedId !== undefined) return storedId;

  const githubClient = await createOctokitClient(appToken, ghesApiUrl);

  return (
    await githubClient.apps.getOrgInstallation({
      org,
    })
  ).data.id;
}

async function getGitHubRegisteredRunnnerStatusses(
  ghClient: Octokit,
  runnerOwner: string,
  runnerNamePrefix: string,
): Promise<Map<string, RunnerStatus>> {
  const runners = await ghClient.paginate(ghClient.actions.listSelfHostedRunnersForOrg, {
    org: runnerOwner,
    per_page: 100,
  });
  const runnerStatus = new Map<string, RunnerStatus>();
  for (const runner of runners) {
    runner.name = runnerNamePrefix ? runner.name.replace(runnerNamePrefix, '') : runner.name;
    runnerStatus.set(runner.name, { busy: runner.busy, status: runner.status });
  }
  return runnerStatus;
}
