import type {
  CreateStartRunnerConfig,
  PoolComputeProvider,
  ComputeProviderPlugin,
  ScaleDownComputeProvider,
  ScaleUpComputeProvider,
} from '../../core';

import type { ControlPlaneProviderCapabilities, ControlPlaneProviderModule } from '../../contracts';

export interface TemplateScaleUpState {
  resourceGroupId: string;
}

function notImplemented(operation: string): never {
  throw new Error(`Template compute provider must implement ${operation}`);
}

export function createTemplatePoolProvider(
  createStartRunnerConfig: CreateStartRunnerConfig,
): Omit<PoolComputeProvider, 'type'> {
  return {
    listRunners: async () => notImplemented('pool.listRunners'),
    countAvailableRunners: () => notImplemented('pool.countAvailableRunners'),
    createRunners: async (input) => {
      // Use this dependency after provisioning runner IDs to create their GitHub configuration.
      void createStartRunnerConfig;
      void input;
      return notImplemented('pool.createRunners');
    },
  };
}

export function createTemplateScaleUpProvider(
  createStartRunnerConfig: CreateStartRunnerConfig,
): Omit<ScaleUpComputeProvider, 'type'> {
  return {
    resolveLabelsForRunners: async (messageLabels) => {
      void messageLabels;
      return notImplemented('scaleUp.resolveLabelsForRunners');
    },
    getCurrentRunners: async (state, input) => {
      const templateState = state as TemplateScaleUpState;
      void templateState;
      void input;
      return notImplemented('scaleUp.getCurrentRunners');
    },
    createRunners: async (input) => {
      // Use this dependency after provisioning runner IDs to create their GitHub configuration.
      void createStartRunnerConfig;
      void input;
      return notImplemented('scaleUp.createRunners');
    },
  };
}

export function createTemplateScaleDownProvider(): Omit<ScaleDownComputeProvider, 'type'> {
  return {
    list: async (environment, orphan) => {
      void environment;
      void orphan;
      return notImplemented('scaleDown.list');
    },
    bootTimeExceeded: (runner) => {
      void runner;
      return notImplemented('scaleDown.bootTimeExceeded');
    },
    markOrphan: async (id) => notImplemented(`scaleDown.markOrphan(${id})`),
    unmarkOrphan: async (id) => notImplemented(`scaleDown.unmarkOrphan(${id})`),
    terminate: async (id) => notImplemented(`scaleDown.terminate(${id})`),
  };
}

export function createTemplateControlPlanePlugin(
  createStartRunnerConfig: CreateStartRunnerConfig,
): ComputeProviderPlugin<ControlPlaneProviderCapabilities, 'template'> {
  return {
    type: 'template',
    capabilities: {
      pool: () => createTemplatePoolProvider(createStartRunnerConfig),
      scaleUp: () => createTemplateScaleUpProvider(createStartRunnerConfig),
      scaleDown: createTemplateScaleDownProvider,
    },
  };
}

export const provider = {
  type: 'template',
  createPlugin: createTemplateControlPlanePlugin,
} satisfies ControlPlaneProviderModule<'template'>;
