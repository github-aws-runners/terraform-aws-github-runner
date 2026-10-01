import type { ScaleSetComputeProviderModule, ScaleSetComputeProviderPlugin } from '../../scale-set';

import {
  createMicrovmScaleSetProvider,
  type MicrovmScaleSetProviderDependencies,
} from './src/scale-set/provider';

export type { MicrovmScaleSetProviderConfig, MicrovmScaleSetProviderDependencies } from './src/scale-set/provider';
export { createMicrovmScaleSetProvider, parseMicrovmScaleSetProviderConfig } from './src/scale-set/provider';

export function createMicrovmScaleSetPlugin(
  dependencies: MicrovmScaleSetProviderDependencies = {},
): ScaleSetComputeProviderPlugin<'microvm'> {
  return {
    type: 'microvm',
    capabilities: {
      environmentVariables: {},
      create: (input) => createMicrovmScaleSetProvider(input, dependencies),
    },
  };
}

export const provider = {
  type: 'microvm',
  createPlugin: createMicrovmScaleSetPlugin,
} satisfies ScaleSetComputeProviderModule<'microvm'>;
