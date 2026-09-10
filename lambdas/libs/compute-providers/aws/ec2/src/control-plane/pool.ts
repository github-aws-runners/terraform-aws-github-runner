import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import type { Octokit } from '@octokit/rest';
import type {
  CreateStartRunnerConfig,
  ListPoolRunnersInput,
  PoolComputeProvider,
  RunnerInfo,
  RunnerStatus,
} from '../../../../core';
import { bootTimeExceeded, type Ec2RunnerResourceOperations } from '../runners';
import { createRunners, loadEc2ProviderConfig, registerRunners } from './runner-creation';
import { startWarmInstances } from './scale-up';
import {
  addToWarmPool,
  countWarmInstancesByOwner,
  emitWarmPoolMetric,
  getPoolStrategy,
  getWarmPoolConfig,
  resolveCurrentAmiId,
} from './warm-pool';

const logger = createChildLogger('pool');

function countAvailableEc2PoolRunners(
  ec2runners: RunnerInfo[],
  runnerStatus: Map<string, RunnerStatus>,
  includeBusyRunners = false,
): number {
  // Runner should be considered idle if it is still booting, or is idle in GitHub
  let numberOfRunnersInPool = 0;
  for (const ec2Instance of ec2runners) {
    if (
      (runnerStatus.get(ec2Instance.id)?.busy === false || includeBusyRunners) &&
      runnerStatus.get(ec2Instance.id)?.status === 'online'
    ) {
      numberOfRunnersInPool++;
      logger.debug(`Runner ${ec2Instance.id} is idle in GitHub and counted as part of the pool`);
    } else if (runnerStatus.get(ec2Instance.id) != null) {
      logger.debug(`Runner ${ec2Instance.id} is not idle in GitHub and NOT counted as part of the pool`);
    } else if (!bootTimeExceeded(ec2Instance)) {
      numberOfRunnersInPool++;
      logger.info(`Runner ${ec2Instance.id} is still booting and counted as part of the pool`);
    } else {
      logger.debug(`Runner ${ec2Instance.id} is not idle in GitHub nor booting and not counted as part of the pool`);
    }
  }
  return numberOfRunnersInPool;
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

/**
 * After a grace period, stops any newly created pool runners that are still idle and moves them into
 * the warm pool, so the warm strategy holds cheap stopped capacity instead of running instances.
 */
async function warmPoolGracePeriod(
  ec2Operations: Ec2RunnerResourceOperations,
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
      await ec2Operations.tag(instanceId, [{ Key: 'ghr:warm-pool-grace-hit', Value: 'true' }]).catch(() => {
        /* best-effort */
      });
      emitWarmPoolMetric('WarmPoolInstanceStarted', 1, { Owner: runnerOwner });
    } else {
      // Runner is idle after the grace period — stop and add to the warm pool.
      try {
        await ec2Operations.stop(instanceId);
        await addToWarmPool({
          instanceId,
          runnerOwner,
          environment: environment || '',
          runnerType: 'Org',
          amiId,
        });
        await ec2Operations.tag(instanceId, [{ Key: 'ghr:warm-pool-member', Value: 'true' }]).catch(() => {
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

export function createEc2PoolCapability(
  ec2Operations: Ec2RunnerResourceOperations,
  createStartRunnerConfig: CreateStartRunnerConfig,
): Omit<PoolComputeProvider<RunnerInfo>, 'type'> {
  return {
    listRunners: ({ environment, runnerOwner, runnerType }) =>
      ec2Operations.list({
        environment,
        runnerOwner,
        runnerType,
        statuses: ['running'],
      }),
    countAvailableRunners: countAvailableEc2PoolRunners,
    additionalPoolCapacity: ec2AdditionalPoolCapacity,
    createRunners: async ({ githubRunnerConfig, numberOfRunners, githubInstallationClient, storage }) => {
      const warmPoolConfig = getWarmPoolConfig();
      const poolStrategy = getPoolStrategy();

      // Restart warm instances before cold-launching new ones (applies whenever the warm pool is enabled).
      let warmInstances: string[] = [];
      if (warmPoolConfig.enabled) {
        const started = await startWarmInstances(ec2Operations, githubRunnerConfig.runnerOwner, numberOfRunners);
        if (started.length > 0) {
          const result = await registerRunners(
            ec2Operations,
            githubRunnerConfig,
            { instances: started, retryableErrorCount: 0, nonRetryableErrorCount: 0 },
            githubInstallationClient,
            createStartRunnerConfig,
            storage,
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
          ec2Operations,
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
          createStartRunnerConfig,
          'pool-lambda',
          storage,
        );
        coldInstances = instances;

        // Warm strategy: after a grace period, stop any newly created runners that are still idle and move
        // them into the warm pool so the pool holds stopped (cheap) capacity instead of running instances.
        if (warmPoolConfig.enabled && poolStrategy === 'warm' && coldInstances.length > 0) {
          await warmPoolGracePeriod(
            ec2Operations,
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
    },
  };
}
