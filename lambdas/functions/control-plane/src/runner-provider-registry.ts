import type { RunnerProviderType } from '@aws-github-runner/runner-provider';

import { createEc2PoolProvider } from './pool/ec2-pool';
import type { PoolRunnerProvider } from './pool/pool-provider';
import { createEc2ScaleDownProvider } from './scale-runners/ec2-scale-down';
import { createEc2ScaleUpProvider } from './scale-runners/ec2-scale-up';
import type { ScaleDownRunnerProvider } from './scale-runners/scale-down-provider';
import type { ScaleUpRunnerProvider } from './scale-runners/scale-up-provider';

interface RunnerProviderFactory {
  pool: () => Omit<PoolRunnerProvider, 'type'>;
  scaleUp: () => Omit<ScaleUpRunnerProvider, 'type'>;
  scaleDown: () => Omit<ScaleDownRunnerProvider, 'type'>;
}

const runnerProviderFactories: Record<RunnerProviderType, RunnerProviderFactory> = {
  ec2: {
    pool: createEc2PoolProvider,
    scaleUp: createEc2ScaleUpProvider,
    scaleDown: createEc2ScaleDownProvider,
  },
};

export function createPoolRunnerProvider(type: RunnerProviderType): PoolRunnerProvider {
  return { ...runnerProviderFactories[type].pool(), type };
}

export function createScaleUpRunnerProvider(type: RunnerProviderType): ScaleUpRunnerProvider {
  return { ...runnerProviderFactories[type].scaleUp(), type };
}

export function createScaleDownRunnerProvider(type: RunnerProviderType): ScaleDownRunnerProvider {
  return { ...runnerProviderFactories[type].scaleDown(), type };
}
