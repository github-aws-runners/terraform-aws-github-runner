import type { ScaleDownComputeProvider } from '../../../../core';
import { bootTimeExceeded, type Ec2RunnerResourceOperations } from '../runners';

export function createEc2ScaleDownProvider(
  runnerOperations: Ec2RunnerResourceOperations,
): Omit<ScaleDownComputeProvider, 'type'> {
  return {
    list: (environment, orphan) => runnerOperations.list({ environment, orphan }),
    bootTimeExceeded,
    markOrphan: (id) => runnerOperations.tag(id, [{ Key: 'ghr:orphan', Value: 'true' }]),
    unmarkOrphan: (id) => runnerOperations.untag(id, [{ Key: 'ghr:orphan', Value: 'true' }]),
    terminate: (id) => runnerOperations.terminate(id),
  };
}
