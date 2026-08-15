import type { ComputeProviderPlugin } from '../../core';

import type { ScaleSetProviderCapabilities, ScaleSetProviderModule } from '../../contracts';
import type {} from './src/environment';
import { createEc2ScaleSetProvider } from './src/control-plane/scale-set';

export function createEc2ScaleSetPlugin(): ComputeProviderPlugin<ScaleSetProviderCapabilities, 'ec2'> {
  return {
    type: 'ec2',
    capabilities: {
      scaleSet: createEc2ScaleSetProvider,
    },
  };
}

export const provider = {
  type: 'ec2',
  createPlugin: createEc2ScaleSetPlugin,
} satisfies ScaleSetProviderModule<'ec2'>;
