import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { getParameter } from '@aws-github-runner/aws-ssm-util';

import { bootTimeExceeded, listEC2Runners, stopRunner, tag, terminateRunner, untag } from './../aws/ec2-runners';
import type { RunnerList } from './../aws/ec2-runners.d';
import {
  addToWarmPool,
  countWarmInstancesByOwner,
  emitWarmPoolMetric,
  getPoolStrategy,
  getWarmPoolConfig,
  listWarmInstancesByOwner,
  removeFromWarmPool,
} from '../aws/warm-pool';
import type { RunnerInfo, RunnerList as ScaleDownRunnerList, ScaleDownRunnerProvider } from './scale-down-provider';

const logger = createChildLogger('ec2-scale-down');

async function listEc2ScaleDownRunners(environment: string, orphan?: boolean): Promise<ScaleDownRunnerList[]> {
  return (await listEC2Runners({ environment, orphan })).map(toScaleDownRunner);
}

async function markEc2RunnerOrphan(id: string): Promise<void> {
  await tag(id, [{ Key: 'ghr:orphan', Value: 'true' }]);
}

async function unmarkEc2RunnerOrphan(id: string): Promise<void> {
  await untag(id, [{ Key: 'ghr:orphan', Value: 'true' }]);
}

/**
 * Disposes of an idle EC2 runner after GitHub de-registration. When the warm pool is enabled and the
 * pool strategy is `warm`, the instance is stopped and recorded in the warm pool (subject to capacity)
 * so a future scale-up can restart it quickly. On any failure — or when the warm pool is full/disabled —
 * the instance is terminated so a de-registered runner never leaks.
 */
async function retireEc2Runner(runner: RunnerInfo): Promise<void> {
  const warmPoolConfig = getWarmPoolConfig();
  const poolStrategy = getPoolStrategy();

  if (!(warmPoolConfig.enabled && poolStrategy === 'warm')) {
    await terminateRunner(runner.id);
    logger.info(`EC2 runner instance '${runner.id}' is terminated and GitHub runner is de-registered.`);
    return;
  }

  const warmCount = await countWarmInstancesByOwner(runner.owner);
  if (warmCount >= warmPoolConfig.maxWarmInstances) {
    await terminateRunner(runner.id);
    logger.info(`Runner '${runner.id}' terminated (warm pool full: ${warmCount}/${warmPoolConfig.maxWarmInstances}).`);
    return;
  }

  try {
    await stopRunner(runner.id);
    const amiId = await resolveCurrentAmiId();
    await addToWarmPool({
      instanceId: runner.id,
      runnerOwner: runner.owner,
      environment: process.env.ENVIRONMENT || '',
      runnerType: runner.type,
      amiId,
    });
    await tag(runner.id, [{ Key: 'ghr:warm-pool-member', Value: 'true' }]);
    emitWarmPoolMetric('WarmPoolInstanceStopped', 1, { Owner: runner.owner });
    logger.info(
      `Runner '${runner.id}' stopped and added to warm pool (${warmCount + 1}/${warmPoolConfig.maxWarmInstances}).`,
    );
  } catch (warmPoolError) {
    logger.warn(`Failed to stop runner '${runner.id}' into warm pool, terminating instead.`, {
      error: warmPoolError,
    });
    await terminateRunner(runner.id);
  }
}

/**
 * Evicts warm (stopped) instances that exceed the configured age or count limits, or whose AMI is stale
 * relative to the current launch template AMI. Owners are gathered from running *and* stopped instances so
 * owners with only warm instances are still evicted.
 */
async function evictStaleWarmInstances(environment: string): Promise<void> {
  const warmPoolConfig = getWarmPoolConfig();
  if (!warmPoolConfig.enabled) {
    return;
  }

  const ownerTags = new Set<string>();
  const ec2runners = await listEC2Runners({
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
            await terminateRunner(entry.instanceId);
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

export async function resolveCurrentAmiId(): Promise<string | undefined> {
  const amiSsmParam = process.env.AMI_ID_SSM_PARAMETER_NAME;
  if (!amiSsmParam) {
    return undefined;
  }
  try {
    return await getParameter(amiSsmParam);
  } catch (e) {
    logger.warn('Failed to resolve current AMI ID for warm pool staleness check', { error: e });
    return undefined;
  }
}

export function createEc2ScaleDownProvider(): Omit<ScaleDownRunnerProvider, 'type'> {
  return {
    list: listEc2ScaleDownRunners,
    bootTimeExceeded,
    markOrphan: markEc2RunnerOrphan,
    unmarkOrphan: unmarkEc2RunnerOrphan,
    terminate: terminateRunner,
    retire: retireEc2Runner,
    maintain: evictStaleWarmInstances,
  };
}

function toScaleDownRunner(runner: RunnerList): ScaleDownRunnerList {
  return {
    id: runner.instanceId,
    launchTime: runner.launchTime,
    owner: runner.owner,
    type: runner.type,
    repo: runner.repo,
    org: runner.org,
    orphan: runner.orphan,
    githubRunnerId: runner.runnerId,
    bypassRemoval: runner.bypassRemoval,
  };
}
