import type { CreateStartRunnerConfig } from './core';
import { createRunnerProviderRegistry } from './core';

import type { ControlPlaneProviderCapabilities } from './contracts';
import { enabledControlPlaneProviders } from './providers.config.control-plane';

export function createControlPlaneProviderRegistry(createStartRunnerConfig: CreateStartRunnerConfig) {
  return createRunnerProviderRegistry<ControlPlaneProviderCapabilities>(
    enabledControlPlaneProviders.map((provider) => provider.createPlugin(createStartRunnerConfig)),
  );
}
