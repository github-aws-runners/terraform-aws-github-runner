import { createChildLogger, createSingleMetric } from '@aws-github-runner/aws-powertools-util';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import yn from 'yn';

import type { PoolComputeProvider, StandbyImage, StandbyInstance } from './pool-provider';

const logger = createChildLogger('warm-pool');

const MINUTE_IN_MS = 60 * 1000;
const HOUR_IN_MS = 60 * MINUTE_IN_MS;

export type WarmPoolEvictionReason =
  | 'max-age'
  | 'drift'
  | 'over-target'
  | 'stuck-priming'
  | 'garbage'
  | 'orphaned-spot-request';

interface Eviction {
  instance: StandbyInstance;
  reason: WarmPoolEvictionReason;
}

interface EvictionPolicy {
  poolSize: number;
  current: StandbyImage;
  maxAgeHours: number;
  bootTimeInMinutes: number;
  now: number;
}

export function isWarmPoolEnabled(): boolean {
  return yn(process.env.WARM_POOL_ENABLED, { default: false });
}

export async function adjustWarmPool(
  computeProvider: Pick<PoolComputeProvider, 'type' | 'standby'>,
  poolSize: number,
): Promise<void> {
  const standby = computeProvider.standby;
  if (!standby) {
    throw new Error(`Compute provider '${computeProvider.type}' does not support a warm pool.`);
  }
  logger.info(`Checking current ${computeProvider.type} warm pool against pool of size: ${poolSize}`);

  const environment = process.env.ENVIRONMENT;
  // Warm instances are owner-agnostic until activation; scale-up lists them by environment too.
  const input = { environment, runnerOwner: environment, runnerType: 'Org' as const };
  const maxAgeHours = parseInt(process.env.WARM_POOL_MAX_AGE_HOURS || '168');
  const bootTimeInMinutes = parseInt(process.env.RUNNER_BOOT_TIME_IN_MINUTES || '5');

  const instances = await standby.list(input);
  const current = standby.currentImage ? await standby.currentImage() : {};
  const evictions = selectEvictions(instances, { poolSize, current, maxAgeHours, bootTimeInMinutes, now: Date.now() });

  const evictionCounts = new Map<WarmPoolEvictionReason, number>();
  if (evictions.length > 0) {
    for (const { instance, reason } of evictions) {
      logger.info(`Evicting ${instance.state} standby instance '${instance.instanceId}' (${reason}).`);
    }
    const result = await standby.destroy(
      evictions.map(({ instance }) => ({
        instanceId: instance.instanceId,
        spotInstanceRequestId: instance.spotInstanceRequestId,
      })),
    );
    const destroyed = new Set(result.succeeded);
    for (const { instance, reason } of evictions) {
      if (destroyed.has(instance.instanceId)) evictionCounts.set(reason, (evictionCounts.get(reason) ?? 0) + 1);
    }
    if (result.failed.length > 0) {
      logger.warn(`Failed to destroy ${result.failed.length} standby instance(s).`, { instanceIds: result.failed });
    }
  }

  if (standby.listOrphanedSpotRequests && standby.cancelSpotRequests) {
    const orphaned = await standby.listOrphanedSpotRequests(input);
    if (orphaned.length > 0) {
      const result = await standby.cancelSpotRequests(orphaned.map((request) => request.spotInstanceRequestId));
      if (result.succeeded.length > 0) evictionCounts.set('orphaned-spot-request', result.succeeded.length);
    }
  }

  const evicted = new Set(evictions.map(({ instance }) => instance.instanceId));
  const remaining = instances.filter((instance) => !evicted.has(instance.instanceId));
  const warm = remaining.filter((instance) => instance.state === 'WARM').length;
  let priming = remaining.filter((instance) => instance.state === 'PRIMING').length;
  const deficit = poolSize - (warm + priming);

  if (deficit > 0) {
    logger.info(`The warm pool will be refilled with ${deficit} instance(s).`, { warm, priming });
    const result = await standby.launch({ ...input, numberOfInstances: deficit, maxAgeHours });
    priming += result.instances.length;
    if (result.instances.length < deficit) {
      logger.warn(`Launched ${result.instances.length} of ${deficit} requested warm instance(s).`, {
        retryableErrorCount: result.retryableErrorCount,
        nonRetryableErrorCount: result.nonRetryableErrorCount,
      });
    }
  } else {
    logger.info(`Warm pool will not be refilled. Found ${warm} warm and ${priming} priming instance(s).`);
  }

  publishWarmPoolMetrics(environment, warm, priming, evictionCounts);
}

function selectEvictions(instances: StandbyInstance[], policy: EvictionPolicy): Eviction[] {
  const evictions: Eviction[] = [];
  const keptWarm: StandbyInstance[] = [];
  for (const instance of instances) {
    const reason = evictionReason(instance, policy);
    if (reason) evictions.push({ instance, reason });
    else if (instance.state === 'WARM') keptWarm.push(instance);
  }

  const launchedAt = (instance: StandbyInstance) => instance.launchTime?.getTime() ?? 0;
  const overTarget = [...keptWarm]
    .sort((a, b) => launchedAt(a) - launchedAt(b))
    .slice(0, Math.max(keptWarm.length - policy.poolSize, 0));
  return [...evictions, ...overTarget.map((instance) => ({ instance, reason: 'over-target' as const }))];
}

function evictionReason(instance: StandbyInstance, policy: EvictionPolicy): WarmPoolEvictionReason | undefined {
  const age = instance.launchTime ? policy.now - instance.launchTime.getTime() : undefined;
  switch (instance.state) {
    case 'GARBAGE':
      return 'garbage';
    case 'PRIMING':
      return age !== undefined && age > policy.bootTimeInMinutes * MINUTE_IN_MS ? 'stuck-priming' : undefined;
    case 'WARM':
      if (age !== undefined && age > policy.maxAgeHours * HOUR_IN_MS) return 'max-age';
      return isDrifted(instance, policy.current) ? 'drift' : undefined;
    default:
      return undefined;
  }
}

function isDrifted(instance: StandbyInstance, current: StandbyImage): boolean {
  return (
    (current.imageId !== undefined && instance.imageId !== current.imageId) ||
    (current.launchTemplateVersion !== undefined && instance.launchTemplateVersion !== current.launchTemplateVersion)
  );
}

function publishWarmPoolMetrics(
  environment: string,
  warm: number,
  priming: number,
  evictionCounts: Map<WarmPoolEvictionReason, number>,
): void {
  if (!yn(process.env.ENABLE_METRIC_WARM_POOL, { default: false })) return;
  createSingleMetric('WarmPoolWarmInstances', MetricUnit.Count, warm, { Environment: environment });
  createSingleMetric('WarmPoolPrimingInstances', MetricUnit.Count, priming, { Environment: environment });
  for (const [reason, count] of evictionCounts) {
    createSingleMetric('WarmPoolEvictions', MetricUnit.Count, count, { Environment: environment, Reason: reason });
  }
}
