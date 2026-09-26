import type { ComputeProviderPlugin, CreateStartRunnerConfig } from '../../core';

import type { ControlPlaneProviderCapabilities, ControlPlaneProviderModule } from '../../contracts';
import type {} from './src/environment';
import { createMicrovmPoolProvider } from './src/control-plane/pool';
import { createMicrovmScaleDownProvider } from './src/control-plane/scale-down';
import { createMicrovmScaleUpProvider } from './src/control-plane/scale-up';

export function createMicrovmControlPlanePlugin(
  createStartRunnerConfig: CreateStartRunnerConfig,
): ComputeProviderPlugin<ControlPlaneProviderCapabilities, 'microvm'> {
  return {
    type: 'microvm',
    capabilities: {
      pool: () => createMicrovmPoolProvider(createStartRunnerConfig),
      scaleUp: () => createMicrovmScaleUpProvider(createStartRunnerConfig),
      scaleDown: createMicrovmScaleDownProvider,
    },
  };
}

export const provider = {
  type: 'microvm',
  createPlugin: createMicrovmControlPlanePlugin,
} satisfies ControlPlaneProviderModule<'microvm'>;
