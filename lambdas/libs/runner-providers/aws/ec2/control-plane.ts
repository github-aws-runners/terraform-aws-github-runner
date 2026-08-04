import type { CreateStartRunnerConfig, RunnerProviderPlugin } from '../../core';

import type { ControlPlaneProviderCapabilities, ControlPlaneProviderModule } from '../../contracts';
import type {} from './src/environment';
import { createEc2PoolProvider } from './src/control-plane/pool';
import { createEc2ScaleDownProvider } from './src/control-plane/scale-down';
import { createEc2ScaleUpProvider } from './src/control-plane/scale-up';

export function createEc2ControlPlanePlugin(
  createStartRunnerConfig: CreateStartRunnerConfig,
): RunnerProviderPlugin<ControlPlaneProviderCapabilities, 'ec2'> {
  return {
    type: 'ec2',
    capabilities: {
      pool: () => createEc2PoolProvider(createStartRunnerConfig),
      scaleUp: () => createEc2ScaleUpProvider(createStartRunnerConfig),
      scaleDown: createEc2ScaleDownProvider,
    },
  };
}

export const provider = {
  type: 'ec2',
  createPlugin: createEc2ControlPlanePlugin,
} satisfies ControlPlaneProviderModule<'ec2'>;
