import type { CreateStartRunnerConfig } from './core';
import { createRunnerProviderRegistry } from './core';

import { createEc2ControlPlanePlugin } from './aws/ec2/control-plane';
import type { ControlPlaneProviderCapabilities } from './contracts';
import { enabledRunnerProviderTypes } from './providers.config';

const installedControlPlaneProviders = {
  ec2: createEc2ControlPlanePlugin,
};

export function createControlPlaneProviderRegistry(createStartRunnerConfig: CreateStartRunnerConfig) {
  return createRunnerProviderRegistry<ControlPlaneProviderCapabilities>(
    enabledRunnerProviderTypes.map((type) => installedControlPlaneProviders[type](createStartRunnerConfig)),
  );
}
