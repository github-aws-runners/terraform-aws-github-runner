import type { CreateStartRunnerConfig } from './core';
import { createComputeProviderRegistry } from './core';

import type { ControlPlaneProviderCapabilities } from './contracts';
import { enabledControlPlaneProviders } from './providers.config.control-plane';

export function createControlPlaneProviderRegistry(createStartRunnerConfig: CreateStartRunnerConfig) {
  return createComputeProviderRegistry<ControlPlaneProviderCapabilities>(
    enabledControlPlaneProviders.map((provider) => provider.createPlugin(createStartRunnerConfig)),
  );
}
