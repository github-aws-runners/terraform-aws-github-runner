import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import type { RunnerInfo, ScaleDownComputeProvider } from '../../../../core';
import { bootTimeExceeded, type Ec2RunnerResourceOperations } from '../runners';
import {
  addToWarmPool,
  countWarmInstancesByOwner,
  emitWarmPoolMetric,
  getPoolStrategy,
  getWarmPoolConfig,
  listWarmInstancesByOwner,
  removeFromWarmPool,
  resolveCurrentAmiId,
} from './warm-pool';

const logger = createChildLogger('ec2-scale-down');

/**
 * Idle-confirmation window (see ScaleDownComputeProvider.markIdle). EC2 persists the
 * observation as an instance tag, so it survives between scale-down invocations without
 * any extra state store — the same mechanism `ghr:orphan` uses.
 */
export const IDLE_DETECTED_TAG = 'ghr:idle_detected_at';

/**
 * Disposes of an idle EC2 runner after GitHub de-registration. When the warm pool is enabled and the
 * pool strategy is `warm`, the instance is stopped and recorded in the warm pool (subject to capacity)
 * so a future scale-up can restart it quickly. On any failure — or when the warm pool is full/disabled —
 * the instance is terminated so a de-registered runner never leaks.
 */
async function retireEc2Runner(ec2Operations: Ec2RunnerResourceOperations, runner: RunnerInfo): Promise<void> {
  const warmPoolConfig = getWarmPoolConfig();
  const poolStrategy = getPoolStrategy();

  if (!(warmPoolConfig.enabled && poolStrategy === 'warm')) {
    await ec2Operations.terminate(runner.id);
    logger.info(`EC2 runner instance '${runner.id}' is terminated and GitHub runner is de-registered.`);
    return;
  }

  const warmCount = await countWarmInstancesByOwner(runner.owner);
  if (warmCount >= warmPoolConfig.maxWarmInstances) {
    await ec2Operations.terminate(runner.id);
    logger.info(`Runner '${runner.id}' terminated (warm pool full: ${warmCount}/${warmPoolConfig.maxWarmInstances}).`);
    return;
  }

  try {
    await ec2Operations.stop(runner.id);
    const amiId = await resolveCurrentAmiId();
    await addToWarmPool({
      instanceId: runner.id,
      runnerOwner: runner.owner,
      environment: process.env.ENVIRONMENT || '',
      runnerType: runner.type,
      amiId,
    });
    await ec2Operations.tag(runner.id, [{ Key: 'ghr:warm-pool-member', Value: 'true' }]);
    emitWarmPoolMetric('WarmPoolInstanceStopped', 1, { Owner: runner.owner });
    logger.info(
      `Runner '${runner.id}' stopped and added to warm pool (${warmCount + 1}/${warmPoolConfig.maxWarmInstances}).`,
    );
  } catch (warmPoolError) {
    logger.warn(`Failed to stop runner '${runner.id}' into warm pool, terminating instead.`, {
      error: warmPoolError,
    });
    await ec2Operations.terminate(runner.id);
  }
}

/**
 * Evicts warm (stopped) instances that exceed the configured age or count limits, or whose AMI is stale
 * relative to the current launch template AMI. Owners are gathered from running *and* stopped instances so
 * owners with only warm instances are still evicted.
 */
async function evictStaleWarmInstances(
  ec2Operations: Ec2RunnerResourceOperations,
  environment: string,
): Promise<void> {
  const warmPoolConfig = getWarmPoolConfig();
  if (!warmPoolConfig.enabled) {
    return;
  }

  const ownerTags = new Set<string>();
  const ec2runners = await ec2Operations.list({
    environment,
    statuses: ['running', 'pending', 'stopped', 'stopping'],
  });
  for (const runner of ec2runners) {
    if (runner.owner) {
      ownerTags.add(runner.owner);
    }
  }

  const currentAmiId = await resolveCurrentAmiId();

  for (const owner of ownerTags) {
    try {
      const warmInstances = await listWarmInstancesByOwner(owner);
      if (warmInstances.length === 0) {
        continue;
      }

      const now = Date.now() / 1000;
      let evictedCount = 0;

      for (const entry of warmInstances) {
        const ageHours = (now - new Date(entry.stoppedAt).getTime() / 1000) / 3600;
        const exceedsAge = ageHours > warmPoolConfig.maxWarmAgeHours;
        const exceedsCount = warmInstances.length - evictedCount > warmPoolConfig.maxWarmInstances;
        const staleAmi = currentAmiId && entry.amiId && entry.amiId !== currentAmiId;

        if (exceedsAge || exceedsCount || staleAmi) {
          try {
            await ec2Operations.terminate(entry.instanceId);
            await removeFromWarmPool(entry.instanceId);
            evictedCount++;
            const reason = staleAmi ? 'stale_ami' : exceedsAge ? 'max_age_exceeded' : 'max_count_exceeded';
            logger.info(
              `Evicted warm instance '${entry.instanceId}' (age: ${ageHours.toFixed(1)}h, reason: ${reason}).`,
            );
          } catch (e) {
            logger.warn(`Failed to evict warm instance '${entry.instanceId}'`, { error: e });
            // Remove stale DynamoDB record anyway if EC2 termination fails (instance may already be gone).
            await removeFromWarmPool(entry.instanceId).catch(() => {
              /* best-effort */
            });
          }
        }
      }

      if (evictedCount > 0) {
        emitWarmPoolMetric('WarmPoolEvicted', evictedCount, { Owner: owner });
        emitWarmPoolMetric('WarmPoolSize', warmInstances.length - evictedCount, { Owner: owner });
      }
    } catch (e) {
      logger.warn(`Failed to process warm pool eviction for owner '${owner}'`, { error: e });
    }
  }
}

export function createEc2ScaleDownCapability(
  ec2Operations: Ec2RunnerResourceOperations,
): Omit<ScaleDownComputeProvider, 'type'> {
  return {
    list: (environment, orphan) => ec2Operations.list({ environment, orphan }),
    bootTimeExceeded,
    markOrphan: (id) => ec2Operations.tag(id, [{ Key: 'ghr:orphan', Value: 'true' }]),
    unmarkOrphan: (id) => ec2Operations.untag(id, [{ Key: 'ghr:orphan', Value: 'true' }]),
    markIdle: (id, at) => ec2Operations.tag(id, [{ Key: IDLE_DETECTED_TAG, Value: at }]),
    unmarkIdle: (id) => ec2Operations.untag(id, [{ Key: IDLE_DETECTED_TAG }]),
    terminate: (id) => ec2Operations.terminate(id),
    retire: (runner) => retireEc2Runner(ec2Operations, runner),
    maintain: (environment) => evictStaleWarmInstances(ec2Operations, environment),
  };
}
