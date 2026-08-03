import { createRunnerProviderRegistry } from './core';

import type { WebhookProviderCapabilities } from './contracts';
import { enabledWebhookProviders } from './providers.config.webhook';

export const webhookProviderRegistry = createRunnerProviderRegistry<WebhookProviderCapabilities>(
  enabledWebhookProviders.map((provider) => provider.createPlugin()),
);
