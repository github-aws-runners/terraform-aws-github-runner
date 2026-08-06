import { createChildLogger } from '@aws-github-runner/aws-powertools-util';

import { createComputeProviderRegistry } from './core';

import type { DynamicLabelDispatchTarget, RunnerMatcherConfig, WebhookProviderCapabilities } from './contracts';
import { normalizeComputeProviderType } from './provider-types';
import { enabledWebhookProviders } from './providers.config.webhook';

const logger = createChildLogger('compute-provider-webhook');

export const webhookProviderRegistry = createComputeProviderRegistry<WebhookProviderCapabilities>(
  enabledWebhookProviders.map((provider) => provider.createPlugin()),
);

export function selectDynamicLabelQueue(
  matches: RunnerMatcherConfig[],
  nonGhrLabels: string[],
  sanitizedGhrLabels: string[],
): DynamicLabelDispatchTarget | undefined {
  for (const queue of matches) {
    const provider = normalizeComputeProviderType(queue.computeProvider);
    const dynamicLabels = provider ? webhookProviderRegistry.capability(provider, 'dynamicLabels') : undefined;

    if (!dynamicLabels) {
      logger.warn(`Queue ${queue.id} has unsupported compute provider '${provider ?? String(queue.computeProvider)}'`);
      continue;
    }

    const target = dynamicLabels.selectQueue({ queue, nonGhrLabels, sanitizedGhrLabels });
    if (target) return target;
  }

  return undefined;
}
