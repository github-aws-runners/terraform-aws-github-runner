import type { RunnerInfo, ScaleDownComputeProvider } from '../../../../core';
import { bootTimeExceeded, type Ec2RunnerOperations } from '../runners';

async function listEc2ScaleDownRunners(
  runners: Ec2RunnerOperations,
  environment: string,
  orphan?: boolean,
): Promise<RunnerInfo[]> {
  return await runners.list({ environment, orphan });
}

async function markEc2RunnerOrphan(runners: Ec2RunnerOperations, id: string): Promise<void> {
  await runners.tag(id, [{ Key: 'ghr:orphan', Value: 'true' }]);
}

async function unmarkEc2RunnerOrphan(runners: Ec2RunnerOperations, id: string): Promise<void> {
  await runners.untag(id, [{ Key: 'ghr:orphan', Value: 'true' }]);
}

export function createEc2ScaleDownProvider(runners: Ec2RunnerOperations): Omit<ScaleDownComputeProvider, 'type'> {
  return {
    list: (environment, orphan) => listEc2ScaleDownRunners(runners, environment, orphan),
    bootTimeExceeded,
    markOrphan: (id) => markEc2RunnerOrphan(runners, id),
    unmarkOrphan: (id) => unmarkEc2RunnerOrphan(runners, id),
    terminate: (id) => runners.terminate(id),
  };
}
