import { createChildLogger } from '@aws-github-runner/aws-powertools-util';

import type { StandbyReconcileRequest, StandbyReconcileResult } from '../../../../core';
import type { Ec2PoolStandbyOperations, StandbyImage, StandbyInstance } from '../standby-types';

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

export async function reconcileWarmPool(
  standby: Ec2PoolStandbyOperations,
  { environment, desiredSize, maxAgeHours, bootTimeoutMinutes }: StandbyReconcileRequest,
): Promise<StandbyReconcileResult> {
  // Warm instances are owner-agnostic until activation; scale-up lists them by environment too.
  const input = { environment, runnerOwner: environment, runnerType: 'Org' as const };

  const instances = await standby.list(input);
  const current = await standby.currentImage();
  const evictions = selectEvictions(instances, {
    poolSize: desiredSize,
    current,
    maxAgeHours,
    bootTimeInMinutes: bootTimeoutMinutes,
    now: Date.now(),
  });

  const evictionCounts = new Map<WarmPoolEvictionReason, number>();
  const destroyed = new Set<string>();
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
    result.succeeded.forEach((id) => destroyed.add(id));
    for (const { instance, reason } of evictions) {
      if (destroyed.has(instance.instanceId)) evictionCounts.set(reason, (evictionCounts.get(reason) ?? 0) + 1);
    }
    if (result.failed.length > 0) {
      logger.warn(`Failed to destroy ${result.failed.length} standby instance(s).`, { instanceIds: result.failed });
    }
  }

  const orphanedSpotRequests = await standby.listOrphanedSpotRequests(input);
  if (orphanedSpotRequests.length > 0) {
    const result = await standby.cancelSpotRequests(
      orphanedSpotRequests.map((request) => request.spotInstanceRequestId),
    );
    if (result.succeeded.length > 0) evictionCounts.set('orphaned-spot-request', result.succeeded.length);
  }

  const remaining = instances.filter((instance) => !destroyed.has(instance.instanceId));
  const warm = remaining.filter((instance) => instance.state === 'WARM').length;
  let priming = remaining.filter((instance) => instance.state === 'PRIMING').length;
  const deficit = desiredSize - (warm + priming);

  let launched = 0;
  if (deficit > 0) {
    logger.info(`The warm pool will be refilled with ${deficit} instance(s).`, { warm, priming });
    const result = await standby.launch({ ...input, numberOfInstances: deficit, maxAgeHours });
    launched = result.instances.length;
    priming += launched;
    if (launched < deficit) {
      logger.warn(`Launched ${launched} of ${deficit} requested warm instance(s).`, {
        retryableErrorCount: result.retryableErrorCount,
        nonRetryableErrorCount: result.nonRetryableErrorCount,
      });
    }
  } else {
    logger.info(`Warm pool will not be refilled. Found ${warm} warm and ${priming} priming instance(s).`);
  }

  return { ready: warm, preparing: priming, launched, evictions: Object.fromEntries(evictionCounts), errors: [] };
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
