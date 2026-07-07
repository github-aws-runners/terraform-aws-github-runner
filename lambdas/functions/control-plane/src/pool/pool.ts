import { Octokit } from '@octokit/rest';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import yn from 'yn';

import { createGithubAppAuth, createGithubInstallationAuth, createOctokitClient } from '../github/auth';
import { getGitHubEnterpriseApiUrl, validateSsmParameterStoreTags } from '../scale-runners/github-runner';
import { createPoolRunnerProviderFromEnv } from './pool-provider-registry';
import type { PoolRunnerProviderType, RunnerStatus } from './pool-provider';

const logger = createChildLogger('pool');

export interface PoolEvent {
  poolSize: number;
  type: PoolRunnerProviderType;
}

export async function adjust(event: PoolEvent): Promise<void> {
  const runnerProviderType = event.type;
  logger.info(`Checking current ${runnerProviderType} pool size against pool of size: ${event.poolSize}`);
  const runnerLabels = process.env.RUNNER_LABELS || '';
  const runnerGroup = process.env.RUNNER_GROUP_NAME || '';
  const runnerNamePrefix = process.env.RUNNER_NAME_PREFIX || '';
  const environment = process.env.ENVIRONMENT;
  const ssmTokenPath = process.env.SSM_TOKEN_PATH;
  const ssmConfigPath = process.env.SSM_CONFIG_PATH || '';
  const ephemeral = yn(process.env.ENABLE_EPHEMERAL_RUNNERS, { default: false });
  const enableJitConfig = yn(process.env.ENABLE_JIT_CONFIG, { default: ephemeral });
  const disableAutoUpdate = yn(process.env.DISABLE_RUNNER_AUTOUPDATE, { default: false });
  const runnerOwner = process.env.RUNNER_OWNER;
  const ssmParameterStoreTags: { Key: string; Value: string }[] =
    process.env.SSM_PARAMETER_STORE_TAGS && process.env.SSM_PARAMETER_STORE_TAGS.trim() !== ''
      ? validateSsmParameterStoreTags(process.env.SSM_PARAMETER_STORE_TAGS)
      : [];
  // -1 disables the maximum check, matching the scale-up lambda's semantics. Defaults to unlimited
  // when unset so the pool keeps its previous behavior on stacks that do not provide the variable.
  const maximumRunners = parseInt(process.env.RUNNERS_MAXIMUM_COUNT || '-1');
  const includeBusyRunners = yn(process.env.INCLUDE_BUSY_RUNNERS, { default: false });
  const runnerProvider = createPoolRunnerProviderFromEnv(runnerProviderType);

  const { ghesApiUrl, ghesBaseUrl } = getGitHubEnterpriseApiUrl();

  const installationId = await getInstallationId(ghesApiUrl, runnerOwner);
  const ghAuth = await createGithubInstallationAuth(installationId, ghesApiUrl);
  const githubInstallationClient = await createOctokitClient(ghAuth.token, ghesApiUrl);

  // Get statuses of runners registered in GitHub
  const runnerStatusses = await getGitHubRegisteredRunnnerStatusses(
    githubInstallationClient,
    runnerOwner,
    runnerNamePrefix,
  );

  // Look up the managed provider runners, but running does not mean idle.
  const poolRunners = await runnerProvider.listRunners({
    environment,
    runnerOwner,
    runnerType: 'Org',
  });

  const numberOfRunnersInPool = runnerProvider.countAvailableRunners(
    poolRunners,
    runnerStatusses,
    includeBusyRunners,
  );
  let topUp = event.poolSize - numberOfRunnersInPool;

  // The pool must never push the total number of runners (busy + idle) past the configured maximum.
  // poolRunners contains every running runner for this type, so its length is the current total and no
  // extra API call is needed. Without this clamp the pool keeps topping up against idle-only counts and
  // can overshoot runners_maximum_count, while the scale-up lambda correctly refuses to launch.
  if (maximumRunners !== -1 && topUp > 0) {
    const headroom = maximumRunners - poolRunners.length;
    if (topUp > headroom) {
      logger.info(
        `Capping pool top-up from ${topUp} to ${Math.max(headroom, 0)} to respect the maximum of ` +
          `${maximumRunners} runners (currently ${poolRunners.length} running).`,
      );
      topUp = headroom;
    }
  }

  if (topUp > 0) {
    logger.info(`The pool will be topped up with ${topUp} runners.`);
    await runnerProvider.createRunners({
      githubRunnerConfig: {
        ephemeral,
        enableJitConfig,
        ghesBaseUrl,
        runnerLabels,
        runnerGroup,
        runnerOwner,
        runnerNamePrefix,
        runnerType: 'Org',
        disableAutoUpdate: disableAutoUpdate,
        ssmTokenPath,
        ssmConfigPath,
        ssmParameterStoreTags,
      },
      numberOfRunners: topUp,
      githubInstallationClient,
    });
  } else {
    logger.info(`Pool will not be topped up. Found ${numberOfRunnersInPool} managed idle runners.`);
  }
}

async function getInstallationId(ghesApiUrl: string, org: string): Promise<number> {
  const ghAuth = await createGithubAppAuth(undefined, ghesApiUrl);
  const githubClient = await createOctokitClient(ghAuth.token, ghesApiUrl);

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
