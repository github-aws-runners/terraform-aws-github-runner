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
  getInstanceReadyMarker,
  getPoolStrategy,
  getWarmPoolConfig,
  removeFromWarmPool,
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
 * Moves newly created pool runners into the warm pool once they are safe to stop, so the warm
 * strategy holds cheap stopped capacity instead of running instances.
 *
 * Instead of waiting a fixed delay, the pool polls DynamoDB for the readiness marker each instance
 * writes from its start script when it has registered with GitHub and reached a safe-to-stop
 * checkpoint. As soon as an instance signals readiness (and is still idle) it is stopped, so fast
 * AMIs are parked in seconds while slow ones are never stopped mid-boot. `maxWaitSeconds` is the
 * upper bound: any instance that never signals within it falls back to a plain idle check, keeping
 * custom AMIs without the readiness hook working.
 */
export async function warmPoolGracePeriod(
  ec2Operations: Ec2RunnerResourceOperations,
  instanceIds: string[],
  maxWaitSeconds: number,
  runnerOwner: string,
  runnerNamePrefix: string,
  environment: string,
  ghClient: Octokit,
): Promise<void> {
  logger.info(
    `Warm strategy: waiting up to ${maxWaitSeconds}s for readiness signals from ${instanceIds.length} new instances`,
  );
  const amiId = await resolveCurrentAmiId();
  const deadline = Date.now() + maxWaitSeconds * 1000;
  const pollIntervalMs = 5000;
  const pending = new Set(instanceIds);

  const park = async (instanceId: string, runnerStatuses: Map<string, RunnerStatus>): Promise<void> => {
    if (runnerStatuses.get(instanceId)?.busy) {
      // Runner picked up a job before it could be parked — leave it running and drop the marker.
      logger.info(`Runner '${instanceId}' picked up a job, leaving running`);
      await ec2Operations.tag(instanceId, [{ Key: 'ghr:warm-pool-grace-hit', Value: 'true' }]).catch(() => {
        /* best-effort */
      });
      await removeFromWarmPool(instanceId).catch(() => {
        /* best-effort */
      });
      emitWarmPoolMetric('WarmPoolInstanceStarted', 1, { Owner: runnerOwner });
      return;
    }
    try {
      await ec2Operations.stop(instanceId);
      // Overwrites the readiness marker with the full warm entry (stoppedAt/expiresAt/owner/...).
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
      logger.info(`Warm strategy: stopped idle runner '${instanceId}'`);
    } catch (e) {
      logger.warn(`Failed to stop runner '${instanceId}'`, { error: e });
    }
  };

  while (pending.size > 0 && Date.now() < deadline) {
    const ready: string[] = [];
    for (const instanceId of pending) {
      const readyAt = await getInstanceReadyMarker(instanceId).catch(() => null);
      if (readyAt) {
        ready.push(instanceId);
      }
    }
    if (ready.length > 0) {
      const runnerStatuses = await getGitHubRegisteredRunnerStatuses(ghClient, runnerOwner, runnerNamePrefix);
      for (const instanceId of ready) {
        await park(instanceId, runnerStatuses);
        pending.delete(instanceId);
      }
    }
    const remainingMs = deadline - Date.now();
    if (pending.size === 0 || remainingMs <= 0) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, remainingMs)));
  }

  // Fallback: instances that never signalled readiness are evaluated with a plain idle check so
  // AMIs without the readiness hook still get parked when idle.
  if (pending.size > 0) {
    logger.info(
      `Warm strategy: ${pending.size} instance(s) did not signal readiness within ${maxWaitSeconds}s; ` +
        `falling back to an idle check`,
    );
    const runnerStatuses = await getGitHubRegisteredRunnerStatuses(ghClient, runnerOwner, runnerNamePrefix);
    for (const instanceId of pending) {
      await park(instanceId, runnerStatuses);
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
            // Pool-created spot instances must be persistent so the warm strategy can stop (not just
            // terminate) them; one-time spot instances reject StopInstances with UnsupportedOperation.
            enablePersistentSpot: config.enablePersistentSpot,
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
