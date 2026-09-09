import type { ScaleDownComputeProvider } from '../../../../core';
import { bootTimeExceeded, type Ec2RunnerResourceOperations } from '../runners';

export function createEc2ScaleDownCapability(
  ec2Operations: Ec2RunnerResourceOperations,
): Omit<ScaleDownComputeProvider, 'type'> {
  return {
    list: (environment, orphan) => ec2Operations.list({ environment, orphan }),
    bootTimeExceeded,
    markOrphan: (id) => ec2Operations.tag(id, [{ Key: 'ghr:orphan', Value: 'true' }]),
    unmarkOrphan: (id) => ec2Operations.untag(id, [{ Key: 'ghr:orphan', Value: 'true' }]),
    terminate: (id) => ec2Operations.terminate(id),
  };
}
