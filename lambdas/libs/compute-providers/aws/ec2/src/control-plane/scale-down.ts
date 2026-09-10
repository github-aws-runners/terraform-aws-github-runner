import type { ScaleDownComputeProvider } from '../../../../core';
import { bootTimeExceeded, type Ec2RunnerResourceOperations } from '../runners';

/**
 * Idle-confirmation window (see ScaleDownComputeProvider.markIdle). EC2 persists the
 * observation as an instance tag, so it survives between scale-down invocations without
 * any extra state store — the same mechanism `ghr:orphan` uses.
 */
export const IDLE_DETECTED_TAG = 'ghr:idle_detected_at';

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
  };
}
