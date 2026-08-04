import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import type { Octokit } from '@octokit/rest';

import {
  addToWarmPool,
  countWarmInstancesByOwner,
  emitWarmPoolMetric,
  getPoolStrategy,
  getWarmPoolConfig,
} from '../aws/warm-pool';
import { bootTimeExceeded, listEC2Runners, stopRunner, tag } from '../aws/ec2-runners';
import type { RunnerList } from '../aws/ec2-runners.d';
import { createRunners, loadEc2ProviderConfig, registerRunners } from '../scale-runners/ec2';
import { resolveCurrentAmiId } from '../scale-runners/ec2-scale-down';
import { startWarmInstances } from '../scale-runners/ec2-scale-up';
import type { CreatePoolRunnersInput, ListPoolRunnersInput, PoolRunnerProvider, RunnerStatus } from './pool-provider';

const logger = createChildLogger('pool');

async function listEc2PoolRunners({
  environment,
  runnerOwner,
  runnerType,
}: ListPoolRunnersInput): Promise<RunnerList[]> {
  return await listEC2Runners({
    environment,
    runnerOwner,
    runnerType,
    statuses: ['running'],
  });
}

async function ec2AdditionalPoolCapacity({ runnerOwner }: ListPoolRunnersInput): Promise<number> {
  const warmPoolConfig = getWarmPoolConfig();
  if (!(warmPoolConfig.enabled && getPoolStrategy() === 'warm')) {
    return 0;
  }
  const warmCount = await countWarmInstancesByOwner(runnerOwner);
  logger.info(`Warm strategy: counting ${warmCount} warm (stopped) instances toward the pool target.`);
  return warmCount;
}

async function createEc2PoolRunners({
  githubRunnerConfig,
  numberOfRunners,
  githubInstallationClient,
}: CreatePoolRunnersInput): Promise<string[]> {
  const warmPoolConfig = getWarmPoolConfig();
  const poolStrategy = getPoolStrategy();

  // Restart warm instances before cold-launching new ones (applies whenever the warm pool is enabled).
  let warmInstances: string[] = [];
  if (warmPoolConfig.enabled) {
    const started = await startWarmInstances(githubRunnerConfig.runnerOwner, numberOfRunners);
    if (started.length > 0) {
      const result = await registerRunners(
        githubRunnerConfig,
        { instances: started, retryableErrorCount: 0, nonRetryableErrorCount: 0 },
        githubInstallationClient,
      );
      warmInstances = result.instances;
      logger.info(`Started ${warmInstances.length} warm runner(s) for the pool.`);
    }
  }

  const remaining = numberOfRunners - warmInstances.length;
  let coldInstances: string[] = [];
  if (remaining > 0) {
    const config = loadEc2ProviderConfig();
    const { instances } = await createRunners(
      githubRunnerConfig,
      {
        ec2instanceCriteria: config.ec2instanceCriteria,
        environment: config.environment,
        launchTemplateName: config.launchTemplateName,
        subnets: config.subnets,
        amiIdSsmParameterName: config.amiIdSsmParameterName,
        tracingEnabled: config.tracingEnabled,
        onDemandFailoverOnError: config.onDemandFailoverOnError,
        scaleErrors: config.scaleErrors,
      },
      remaining,
      githubInstallationClient,
      'pool-lambda',
    );
    coldInstances = instances;

    // Warm strategy: after a grace period, stop any newly created runners that are still idle and move
    // them into the warm pool so the pool holds stopped (cheap) capacity instead of running instances.
    if (warmPoolConfig.enabled && poolStrategy === 'warm' && coldInstances.length > 0) {
      await warmPoolGracePeriod(
        coldInstances,
        warmPoolConfig.warmPoolReadyDelaySeconds,
        githubRunnerConfig.runnerOwner,
        githubRunnerConfig.runnerNamePrefix ?? '',
        process.env.ENVIRONMENT,
        githubInstallationClient,
      );
    }
  }

  return [...warmInstances, ...coldInstances];
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

  const runnerStatuses = await getGitHubRegisteredRunnerStatuses(ghClient, runnerOwner, runnerNamePrefix);
  const amiId = await resolveCurrentAmiId();

  for (const instanceId of instanceIds) {
    const status = runnerStatuses.get(instanceId);
    if (status?.busy) {
      // Runner picked up a job during the grace window — leave it running.
      logger.info(`Runner '${instanceId}' picked up a job during grace period, leaving running`);
      await tag(instanceId, [{ Key: 'ghr:warm-pool-grace-hit', Value: 'true' }]).catch(() => {
        /* best-effort */
      });
      emitWarmPoolMetric('WarmPoolInstanceStarted', 1, { Owner: runnerOwner });
    } else {
      // Runner is idle after the grace period — stop and add to the warm pool.
      try {
        await stopRunner(instanceId);
        await addToWarmPool({
          instanceId,
          runnerOwner,
          environment: environment || '',
          runnerType: 'Org',
          amiId,
        });
        await tag(instanceId, [{ Key: 'ghr:warm-pool-member', Value: 'true' }]).catch(() => {
          /* best-effort */
        });
        emitWarmPoolMetric('WarmPoolInstanceStopped', 1, { Owner: runnerOwner });
        logger.info(`Warm strategy: stopped idle runner '${instanceId}' after grace period`);
      } catch (e) {
        logger.warn(`Failed to stop runner '${instanceId}' after grace period`, { error: e });
      }
    }
  }
}

async function getGitHubRegisteredRunnerStatuses(
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
    const name = runnerNamePrefix ? runner.name.replace(runnerNamePrefix, '') : runner.name;
    runnerStatus.set(name, { busy: runner.busy, status: runner.status });
  }
  return runnerStatus;
}

export function createEc2PoolProvider(): Omit<PoolRunnerProvider, 'type'> {
  return {
    listRunners: listEc2PoolRunners,
    countAvailableRunners: calculateEc2PoolSize,
    createRunners: createEc2PoolRunners,
    additionalPoolCapacity: ec2AdditionalPoolCapacity,
  };
}

export function calculateEc2PoolSize(
  ec2runners: RunnerList[],
  runnerStatus: Map<string, RunnerStatus>,
  includeBusyRunners = false,
): number {
  // Runner should be considered idle if it is still booting, or is idle in GitHub
  let numberOfRunnersInPool = 0;
  for (const ec2Instance of ec2runners) {
    if (
      (runnerStatus.get(ec2Instance.instanceId)?.busy === false || includeBusyRunners) &&
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
