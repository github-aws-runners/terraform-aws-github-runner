import { createRunnerProviderRegistry } from './core';

import { ec2WebhookPlugin } from './aws/ec2/webhook';
import type { WebhookProviderCapabilities } from './contracts';
import { enabledRunnerProviderTypes } from './providers.config';

const installedWebhookProviders = {
  ec2: ec2WebhookPlugin,
};

export const webhookProviderRegistry = createRunnerProviderRegistry<WebhookProviderCapabilities>(
  enabledRunnerProviderTypes.map((type) => installedWebhookProviders[type]),
);
