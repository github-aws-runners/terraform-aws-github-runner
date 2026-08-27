import type { RunnerInfo, ScaleDownComputeProvider } from '../../../../core';
import { bootTimeExceeded, type Ec2RunnerOperations } from '../runners';

async function listEc2ScaleDownRunners(
  runnerOperations: Ec2RunnerOperations,
  environment: string,
  orphan?: boolean,
): Promise<RunnerInfo[]> {
  return await runnerOperations.list({ environment, orphan });
}

async function markEc2RunnerOrphan(runnerOperations: Ec2RunnerOperations, id: string): Promise<void> {
  await runnerOperations.tag(id, [{ Key: 'ghr:orphan', Value: 'true' }]);
}

async function unmarkEc2RunnerOrphan(runnerOperations: Ec2RunnerOperations, id: string): Promise<void> {
  await runnerOperations.untag(id, [{ Key: 'ghr:orphan', Value: 'true' }]);
}

export function createEc2ScaleDownProvider(
  runnerOperations: Ec2RunnerOperations,
): Omit<ScaleDownComputeProvider, 'type'> {
  return {
    list: (environment, orphan) => listEc2ScaleDownRunners(runnerOperations, environment, orphan),
    bootTimeExceeded,
    markOrphan: (id) => markEc2RunnerOrphan(runnerOperations, id),
    unmarkOrphan: (id) => unmarkEc2RunnerOrphan(runnerOperations, id),
    terminate: (id) => runnerOperations.terminate(id),
  };
}
