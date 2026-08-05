import type {
  CreateStartRunnerConfig,
  PoolRunnerProvider,
  RunnerProviderPlugin,
  ScaleDownRunnerProvider,
  ScaleUpRunnerProvider,
} from '../../core';

import type { ControlPlaneProviderCapabilities, ControlPlaneProviderModule } from '../../contracts';

export interface TemplateScaleUpState {
  resourceGroupId: string;
}

function notImplemented(operation: string): never {
  throw new Error(`Template runner provider must implement ${operation}`);
}

export function createTemplatePoolProvider(
  createStartRunnerConfig: CreateStartRunnerConfig,
): Omit<PoolRunnerProvider, 'type'> {
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
): Omit<ScaleUpRunnerProvider, 'type'> {
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

export function createTemplateScaleDownProvider(): Omit<ScaleDownRunnerProvider, 'type'> {
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
): RunnerProviderPlugin<ControlPlaneProviderCapabilities, 'template'> {
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
