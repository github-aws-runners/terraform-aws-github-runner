import { createComputeProviderRegistry } from './core';

import type { WebhookProviderCapabilities } from './contracts';
import { enabledWebhookProviders } from './providers.config.webhook';

export const webhookProviderRegistry = createComputeProviderRegistry<WebhookProviderCapabilities>(
  enabledWebhookProviders.map((provider) => provider.createPlugin()),
);
