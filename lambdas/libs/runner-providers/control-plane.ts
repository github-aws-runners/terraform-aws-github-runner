import type { CreateStartRunnerConfig } from './core';
import { createRunnerProviderRegistry } from './core';

import type { ControlPlaneProviderCapabilities } from './contracts';
import { enabledRunnerProviders } from './providers.config';

export function createControlPlaneProviderRegistry(createStartRunnerConfig: CreateStartRunnerConfig) {
  return createRunnerProviderRegistry<ControlPlaneProviderCapabilities>(
    enabledRunnerProviders.map((provider) => provider.createControlPlanePlugin(createStartRunnerConfig)),
  );
}
