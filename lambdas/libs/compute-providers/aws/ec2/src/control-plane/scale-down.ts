import { createChildLogger } from '@aws-github-runner/aws-powertools-util';

import type { ScaleDownComputeProvider } from '../../../../core';
import { bootTimeExceeded, type Ec2RunnerResourceOperations } from '../runners';
import { type Ec2StandbyOperations, type Ec2StoppedWarmInstance, WARM_ACTIVATION_GRACE_MS } from '../standby';

const logger = createChildLogger('scale-down');

export type Ec2ScaleDownStandbyOperations = Pick<Ec2StandbyOperations, 'listStoppedWarmInstances' | 'destroyInstance'>;

/**
 * Idle-confirmation window (see ScaleDownComputeProvider.markIdle). EC2 persists the
 * observation as an instance tag, so it survives between scale-down invocations without
 * any extra state store — the same mechanism `ghr:orphan` uses.
 */
export const IDLE_DETECTED_TAG = 'ghr:idle_detected_at';

export function createEc2ScaleDownCapability(
  ec2Operations: Ec2RunnerResourceOperations,
  standbyOperations?: Ec2ScaleDownStandbyOperations,
): Omit<ScaleDownComputeProvider, 'type'> {
  return {
    ...(standbyOperations && {
      sweepStandby: (environment: string) => sweepStoppedWarmInstances(environment, standbyOperations),
    }),
    list: (environment, orphan) => ec2Operations.list({ environment, orphan }),
    bootTimeExceeded,
    markOrphan: (id) => ec2Operations.tag(id, [{ Key: 'ghr:orphan', Value: 'true' }]),
    unmarkOrphan: (id) => ec2Operations.untag(id, [{ Key: 'ghr:orphan', Value: 'true' }]),
    markIdle: (id, at) => ec2Operations.tag(id, [{ Key: IDLE_DETECTED_TAG, Value: at }]),
    unmarkIdle: (id) => ec2Operations.untag(id, [{ Key: IDLE_DETECTED_TAG }]),
    terminate: (id) => ec2Operations.terminate(id),
  };
}

// Runs even when warm mode is disabled so standby instances left behind are still cleaned up.
async function sweepStoppedWarmInstances(
  environment: string,
  standbyOperations: Ec2ScaleDownStandbyOperations,
): Promise<void> {
  const now = Date.now();
  const instances = (await standbyOperations.listStoppedWarmInstances(environment)).filter((instance) =>
    // The standby expiry no longer applies once an instance was activated.
    instance.activated ? activationSettled(instance, now) : warmExpired(instance, now),
  );
  for (const instance of instances) {
    try {
      await standbyOperations.destroyInstance({
        instanceId: instance.instanceId,
        spotInstanceRequestId: instance.spotInstanceRequestId,
      });
      logger.info(`Destroyed stopped warm instance '${instance.instanceId}'.`, {
        activated: instance.activated,
        expiresAt: instance.expiresAt,
      });
    } catch (error) {
      logger.warn(`Failed to destroy stopped warm instance '${instance.instanceId}'.`, { error });
    }
  }
}

// Scale-up tags an instance as activated before starting it, so a fresh activation is still stopped.
function activationSettled(instance: Ec2StoppedWarmInstance, now: number): boolean {
  const activatedAt = instance.activatedAt === undefined ? NaN : Date.parse(instance.activatedAt);
  return Number.isNaN(activatedAt) || now - activatedAt >= WARM_ACTIVATION_GRACE_MS;
}

function warmExpired(instance: Ec2StoppedWarmInstance, now: number): boolean {
  const expiresAt = instance.expiresAt === undefined ? NaN : Date.parse(instance.expiresAt);
  return !Number.isNaN(expiresAt) && expiresAt <= now;
}
