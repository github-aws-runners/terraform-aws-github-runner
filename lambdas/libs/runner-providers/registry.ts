import type { CreateStartRunnerConfig } from './core';
import { createRunnerProviderRegistry } from './core';

import type { ControlPlaneProviderCapabilities, WebhookProviderCapabilities } from './contracts';
import { enabledRunnerProviders } from './providers.config';

const webhook = createRunnerProviderRegistry<WebhookProviderCapabilities>(
  enabledRunnerProviders.map((provider) => provider.createWebhookPlugin()),
);

export const providerRegistry = {
  types: webhook.types,
  webhook,
  controlPlane: (createStartRunnerConfig: CreateStartRunnerConfig) =>
    createRunnerProviderRegistry<ControlPlaneProviderCapabilities>(
      enabledRunnerProviders.map((provider) => provider.createControlPlanePlugin(createStartRunnerConfig)),
    ),
};
