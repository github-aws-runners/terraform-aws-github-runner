import { createComputeProviderRegistry } from './core';

import type { DynamicLabelDispatchTarget, RunnerMatcherConfig, WebhookProviderCapabilities } from './contracts';
import { resolveComputeProviderType } from './provider-types';
import { enabledWebhookProviders } from './providers.config.webhook';

export const webhookProviderRegistry = createComputeProviderRegistry<WebhookProviderCapabilities>(
  enabledWebhookProviders.map((provider) => provider.createPlugin()),
);

export function selectDynamicLabelQueue(
  matches: RunnerMatcherConfig[],
  nonGhrLabels: string[],
  sanitizedGhrLabels: string[],
): DynamicLabelDispatchTarget | undefined {
  for (const queue of matches) {
    const provider = resolveComputeProviderType(queue.computeProvider);
    const dynamicLabels = webhookProviderRegistry.capability(provider, 'dynamicLabels');

    const target = dynamicLabels.selectQueue({ queue, nonGhrLabels, sanitizedGhrLabels });
    if (target) return target;
  }

  return undefined;
}
