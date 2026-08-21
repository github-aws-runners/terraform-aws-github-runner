import type { RunnerInfo, ScaleDownComputeProvider } from '../../../../core';
import { bootTimeExceeded, listEC2Runners, tag, terminateRunner, untag } from './runners';

async function listEc2ScaleDownRunners(environment: string, orphan?: boolean): Promise<RunnerInfo[]> {
  return await listEC2Runners({ environment, orphan });
}

async function markEc2RunnerOrphan(id: string): Promise<void> {
  await tag(id, [{ Key: 'ghr:orphan', Value: 'true' }]);
}

async function unmarkEc2RunnerOrphan(id: string): Promise<void> {
  await untag(id, [{ Key: 'ghr:orphan', Value: 'true' }]);
}

/**
 * Idle-confirmation window (see ScaleDownComputeProvider.markIdle). EC2 persists the
 * observation as an instance tag, so it survives between scale-down invocations without
 * any extra state store — the same mechanism `ghr:orphan` uses above.
 */
export const IDLE_DETECTED_TAG = 'ghr:idle_detected_at';

async function markEc2RunnerIdle(id: string, at: string): Promise<void> {
  await tag(id, [{ Key: IDLE_DETECTED_TAG, Value: at }]);
}

async function unmarkEc2RunnerIdle(id: string): Promise<void> {
  await untag(id, [{ Key: IDLE_DETECTED_TAG }]);
}

export function createEc2ScaleDownProvider(): Omit<ScaleDownComputeProvider, 'type'> {
  return {
    list: listEc2ScaleDownRunners,
    bootTimeExceeded,
    markOrphan: markEc2RunnerOrphan,
    unmarkOrphan: unmarkEc2RunnerOrphan,
    markIdle: markEc2RunnerIdle,
    unmarkIdle: unmarkEc2RunnerIdle,
    terminate: terminateRunner,
  };
}
