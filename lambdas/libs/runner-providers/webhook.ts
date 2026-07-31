import { createRunnerProviderRegistry } from './core';

import type { WebhookProviderCapabilities } from './contracts';
import { enabledRunnerProviders } from './providers.config';

export const webhookProviderRegistry = createRunnerProviderRegistry<WebhookProviderCapabilities>(
  enabledRunnerProviders.map((provider) => provider.webhookPlugin),
);
