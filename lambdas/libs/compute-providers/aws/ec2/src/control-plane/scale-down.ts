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

export function createEc2ScaleDownProvider(): Omit<ScaleDownComputeProvider, 'type'> {
  return {
    list: listEc2ScaleDownRunners,
    bootTimeExceeded,
    markOrphan: markEc2RunnerOrphan,
    unmarkOrphan: unmarkEc2RunnerOrphan,
    terminate: terminateRunner,
  };
}
