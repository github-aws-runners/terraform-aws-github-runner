import { createRunnerProviderRegistry } from './core';

import type { DynamicLabelDispatchTarget, RunnerMatcherConfig, WebhookProviderCapabilities } from './contracts';
import { resolveRunnerProviderType } from './provider-types';
import { enabledWebhookProviders } from './providers.config.webhook';

export const webhookProviderRegistry = createRunnerProviderRegistry<WebhookProviderCapabilities>(
  enabledWebhookProviders.map((provider) => provider.createPlugin()),
);

export function selectDynamicLabelQueue(
  matches: RunnerMatcherConfig[],
  nonGhrLabels: string[],
  sanitizedGhrLabels: string[],
): DynamicLabelDispatchTarget | undefined {
  for (const queue of matches) {
    const provider = resolveRunnerProviderType(queue.runnerProvider);
    const dynamicLabels = webhookProviderRegistry.capability(provider, 'dynamicLabels');

    const target = dynamicLabels.selectQueue({ queue, nonGhrLabels, sanitizedGhrLabels });
    if (target) return target;
  }

  return undefined;
}
