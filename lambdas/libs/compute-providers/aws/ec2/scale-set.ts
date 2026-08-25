import type { ScaleSetComputeProviderModule, ScaleSetComputeProviderPlugin } from '../../scale-set';

import { createEc2ScaleSetProvider, type Ec2ScaleSetProviderDependencies } from './src/scale-set/provider';

export type { Ec2ScaleSetProviderConfig, Ec2ScaleSetProviderDependencies } from './src/scale-set/provider';
export { createEc2ScaleSetProvider, parseEc2ScaleSetProviderConfig } from './src/scale-set/provider';

export function createEc2ScaleSetPlugin(
  dependencies: Ec2ScaleSetProviderDependencies = {},
): ScaleSetComputeProviderPlugin<'ec2'> {
  return {
    type: 'ec2',
    capabilities: {
      environmentVariables: {},
      create: ({ runnerConfigName, scaleSetId, githubScope, configuration }) =>
        createEc2ScaleSetProvider(
          {
            runnerConfigName,
            scaleSetId,
            githubScope,
            configuration: configuration as Parameters<typeof createEc2ScaleSetProvider>[0]['configuration'],
          },
          dependencies,
        ),
    },
  };
}

export const provider = {
  type: 'ec2',
  createPlugin: createEc2ScaleSetPlugin,
} satisfies ScaleSetComputeProviderModule<'ec2'>;
