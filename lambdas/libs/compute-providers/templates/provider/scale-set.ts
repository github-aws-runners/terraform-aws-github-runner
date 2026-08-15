import type { ComputeProviderPlugin, ScaleSetComputeProvider } from '../../core';

import type { ScaleSetProviderCapabilities, ScaleSetProviderModule } from '../../contracts';

function notImplemented(operation: string): never {
  throw new Error(`Template compute provider must implement ${operation}`);
}

export function createTemplateScaleSetProvider(): Omit<ScaleSetComputeProvider, 'type'> {
  return {
    getCurrentRunners: async (input) => {
      void input;
      return notImplemented('scaleSet.getCurrentRunners');
    },
    createRunners: async (input) => {
      void input;
      return notImplemented('scaleSet.createRunners');
    },
    terminateSurplusRunners: async (input) => {
      void input;
      return notImplemented('scaleSet.terminateSurplusRunners');
    },
    markRunnerStarted: async (input) => {
      void input;
      return notImplemented('scaleSet.markRunnerStarted');
    },
    terminateCompletedRunner: async (input) => {
      void input;
      return notImplemented('scaleSet.terminateCompletedRunner');
    },
  };
}

export function createTemplateScaleSetPlugin(): ComputeProviderPlugin<ScaleSetProviderCapabilities, 'template'> {
  return {
    type: 'template',
    capabilities: {
      scaleSet: createTemplateScaleSetProvider,
    },
  };
}

export const provider = {
  type: 'template',
  createPlugin: createTemplateScaleSetPlugin,
} satisfies ScaleSetProviderModule<'template'>;
