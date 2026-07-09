import { Octokit } from '@octokit/rest';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import yn from 'yn';

import { bootTimeExceeded, listEC2Runners, stopRunner, tag } from '../aws/runners';
import { RunnerList } from '../aws/runners.d';
import { createGithubAppAuth, createGithubInstallationAuth, createOctokitClient } from '../github/auth';
import { createRunners, findAndStartWarmRunners, getGitHubEnterpriseApiUrl } from '../scale-runners/scale-up';
import { validateSsmParameterStoreTags } from '../scale-runners/scale-up';
import { addToWarmPool, getPoolStrategy, getWarmPoolConfig, countWarmInstancesByOwner, emitWarmPoolMetric } from '../aws/warm-pool';

const logger = createChildLogger('pool');

export interface PoolEvent {
  poolSize: number;
}

interface RunnerStatus {
  busy: boolean;
  status: string;
}

export async function adjust(event: PoolEvent): Promise<void> {
  logger.info(`Checking current pool size against pool of size: ${event.poolSize}`);
  const runnerLabels = process.env.RUNNER_LABELS || '';
  const runnerGroup = process.env.RUNNER_GROUP_NAME || '';
  const runnerNamePrefix = process.env.RUNNER_NAME_PREFIX || '';
  const environment = process.env.ENVIRONMENT;
  const ssmTokenPath = process.env.SSM_TOKEN_PATH;
  const ssmConfigPath = process.env.SSM_CONFIG_PATH || '';
  const subnets = process.env.SUBNET_IDS.split(',');
  const instanceTypes = process.env.INSTANCE_TYPES.split(',');
  const instanceTargetCapacityType = process.env.INSTANCE_TARGET_CAPACITY_TYPE;
  const ephemeral = yn(process.env.ENABLE_EPHEMERAL_RUNNERS, { default: false });
  const enableJitConfig = yn(process.env.ENABLE_JIT_CONFIG, { default: ephemeral });
  const disableAutoUpdate = yn(process.env.DISABLE_RUNNER_AUTOUPDATE, { default: false });
  const launchTemplateName = process.env.LAUNCH_TEMPLATE_NAME;
  const instanceMaxSpotPrice = process.env.INSTANCE_MAX_SPOT_PRICE;
  const instanceAllocationStrategy = process.env.INSTANCE_ALLOCATION_STRATEGY || 'lowest-price'; // same as AWS default
  const instanceTypePriorities = process.env.INSTANCE_TYPE_PRIORITIES
    ? (JSON.parse(process.env.INSTANCE_TYPE_PRIORITIES) as Record<string, number>)
    : undefined;
  const runnerOwner = process.env.RUNNER_OWNER;
  const amiIdSsmParameterName = process.env.AMI_ID_SSM_PARAMETER_NAME;
  const tracingEnabled = yn(process.env.POWERTOOLS_TRACE_ENABLED, { default: false });
  const onDemandFailoverOnError = process.env.ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS
    ? (JSON.parse(process.env.ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS) as [string])
    : [];
  const ssmParameterStoreTags: { Key: string; Value: string }[] =
    process.env.SSM_PARAMETER_STORE_TAGS && process.env.SSM_PARAMETER_STORE_TAGS.trim() !== ''
      ? validateSsmParameterStoreTags(process.env.SSM_PARAMETER_STORE_TAGS)
      : [];
  const scaleErrors = JSON.parse(process.env.SCALE_ERRORS) as [string];
  // -1 disables the maximum check, matching the scale-up lambda's semantics. Defaults to unlimited
  // when unset so the pool keeps its previous behavior on stacks that do not provide the variable.
  const maximumRunners = parseInt(process.env.RUNNERS_MAXIMUM_COUNT || '-1');

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

  // Look up the managed ec2 runners in AWS, but running does not mean idle
  const ec2runners = await listEC2Runners({
    environment,
    runnerOwner,
    runnerType: 'Org',
    statuses: ['running'],
  });

  const numberOfRunnersInPool = calculatePooSize(ec2runners, runnerStatusses);
  const poolStrategy = getPoolStrategy();
  const warmPoolConfig = getWarmPoolConfig();

  // For warm strategy, count warm (stopped) instances toward pool target
  let effectivePoolSize = numberOfRunnersInPool;
  if (poolStrategy === 'warm' && warmPoolConfig.enabled) {
    const warmCount = await countWarmInstancesByOwner(runnerOwner);
    effectivePoolSize = numberOfRunnersInPool + warmCount;
    logger.info(`Warm strategy: ${numberOfRunnersInPool} running idle + ${warmCount} warm stopped = ${effectivePoolSize} effective pool size`);
  }

  let topUp = event.poolSize - effectivePoolSize;

  // The pool must never push the total number of runners (busy + idle) past the configured maximum.
  // ec2runners contains every running runner for this type, so its length is the current total and no
  // extra API call is needed. Without this clamp the pool keeps topping up against idle-only counts and
  // can overshoot runners_maximum_count, while the scale-up lambda correctly refuses to launch.
  if (maximumRunners !== -1 && topUp > 0) {
    const headroom = maximumRunners - ec2runners.length;
    if (topUp > headroom) {
      logger.info(
        `Capping pool top-up from ${topUp} to ${Math.max(headroom, 0)} to respect the maximum of ` +
          `${maximumRunners} runners (currently ${ec2runners.length} running).`,
      );
      topUp = headroom;
    }
  }

  if (topUp > 0) {
    logger.info(`The pool will be topped up with ${topUp} runners.`);

    // Try warm instances first (applies to both hot and warm strategies)
    const warmRunnerConfig = {
      ephemeral,
      enableJitConfig,
      ghesBaseUrl,
      runnerLabels,
      runnerGroup,
      runnerNamePrefix,
      runnerOwner,
      runnerType: 'Org' as const,
      disableAutoUpdate,
      ssmTokenPath,
      ssmConfigPath,
      ssmParameterStoreTags,
    };
    const warmInstances = await findAndStartWarmRunners(runnerOwner, topUp, warmRunnerConfig, githubInstallationClient);
    const remainingTopUp = topUp - warmInstances.length;

    if (warmInstances.length > 0) {
      logger.info(`Started ${warmInstances.length} warm runners for pool, need ${remainingTopUp} more from cold start`);
    }

    if (remainingTopUp > 0) {
      const newInstances = await createRunners(
      {
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
      {
        ec2instanceCriteria: {
          instanceTypes,
          instanceTypePriorities,
          targetCapacityType: instanceTargetCapacityType,
          maxSpotPrice: instanceMaxSpotPrice,
          instanceAllocationStrategy: instanceAllocationStrategy,
        },
        environment,
        launchTemplateName,
        subnets,
        amiIdSsmParameterName,
        tracingEnabled,
        onDemandFailoverOnError,
        scaleErrors,
      },
      remainingTopUp,
      githubInstallationClient,
      'pool-lambda',
    );

      // Warm strategy grace period: wait for runners to register, then stop idle ones
      if (poolStrategy === 'warm' && warmPoolConfig.enabled && newInstances.length > 0) {
        await warmPoolGracePeriod(
          newInstances,
          warmPoolConfig.warmPoolReadyDelaySeconds,
          runnerOwner,
          runnerNamePrefix,
          environment,
          githubInstallationClient,
        );
      }
    }
  } else {
    logger.info(`Pool will not be topped up. Found ${effectivePoolSize} effective pool runners (${numberOfRunnersInPool} running + warm).`);
  }
}

async function warmPoolGracePeriod(
  instanceIds: string[],
  delaySeconds: number,
  runnerOwner: string,
  runnerNamePrefix: string,
  environment: string,
  ghClient: Octokit,
): Promise<void> {
  logger.info(`Warm strategy: waiting ${delaySeconds}s grace period for ${instanceIds.length} new instances`);
  await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));

  // Re-check runner statuses after grace period
  const runnerStatuses = await getGitHubRegisteredRunnnerStatusses(ghClient, runnerOwner, runnerNamePrefix);

  for (const instanceId of instanceIds) {
    const status = runnerStatuses.get(instanceId);
    if (status?.busy) {
      // Runner picked up a job during grace window — leave it running
      logger.info(`Runner '${instanceId}' picked up a job during grace period, leaving running`);
      await tag(instanceId, [{ Key: 'ghr:warm-pool-grace-hit', Value: 'true' }]).catch(() => {});
      emitWarmPoolMetric('WarmPoolInstanceStarted', 1, { Owner: runnerOwner });
    } else {
      // Runner is idle after grace period — stop and add to warm pool
      try {
        await stopRunner(instanceId);
        await addToWarmPool({
          instanceId,
          runnerOwner,
          environment,
          runnerType: 'Org',
        });
        await tag(instanceId, [{ Key: 'ghr:warm-pool-member', Value: 'true' }]).catch(() => {});
        emitWarmPoolMetric('WarmPoolInstanceStopped', 1, { Owner: runnerOwner });
        logger.info(`Warm strategy: stopped idle runner '${instanceId}' after grace period`);
      } catch (e) {
        logger.warn(`Failed to stop runner '${instanceId}' after grace period`, { error: e });
      }
    }
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

function calculatePooSize(ec2runners: RunnerList[], runnerStatus: Map<string, RunnerStatus>): number {
  // Runner should be considered idle if it is still booting, or is idle in GitHub
  let numberOfRunnersInPool = 0;
  for (const ec2Instance of ec2runners) {
    if (
      runnerStatus.get(ec2Instance.instanceId)?.busy === false &&
      runnerStatus.get(ec2Instance.instanceId)?.status === 'online'
    ) {
      numberOfRunnersInPool++;
      logger.debug(`Runner ${ec2Instance.instanceId} is idle in GitHub and counted as part of the pool`);
    } else if (runnerStatus.get(ec2Instance.instanceId) != null) {
      logger.debug(`Runner ${ec2Instance.instanceId} is not idle in GitHub and NOT counted as part of the pool`);
    } else if (!bootTimeExceeded(ec2Instance)) {
      numberOfRunnersInPool++;
      logger.info(`Runner ${ec2Instance.instanceId} is still booting and counted as part of the pool`);
    } else {
      logger.debug(
        `Runner ${ec2Instance.instanceId} is not idle in GitHub nor booting and not counted as part of the pool`,
      );
    }
  }
  return numberOfRunnersInPool;
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
