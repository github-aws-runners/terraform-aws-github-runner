import { createChildLogger } from '@aws-github-runner/aws-powertools-util';

import { createRunnerProviderRegistry } from './core';

import type { DynamicLabelDispatchTarget, RunnerMatcherConfig, WebhookProviderCapabilities } from './contracts';
import { normalizeRunnerProviderType } from './provider-types';
import { enabledWebhookProviders } from './providers.config.webhook';

const logger = createChildLogger('runner-provider-webhook');

export const webhookProviderRegistry = createRunnerProviderRegistry<WebhookProviderCapabilities>(
  enabledWebhookProviders.map((provider) => provider.createPlugin()),
);

export function selectDynamicLabelQueue(
  matches: RunnerMatcherConfig[],
  nonGhrLabels: string[],
  sanitizedGhrLabels: string[],
): DynamicLabelDispatchTarget | undefined {
  for (const queue of matches) {
    const provider = normalizeRunnerProviderType(queue.runnerProvider);
    const dynamicLabels = provider ? webhookProviderRegistry.capability(provider, 'dynamicLabels') : undefined;

    if (!dynamicLabels) {
      logger.warn(`Queue ${queue.id} has unsupported runner provider '${provider ?? String(queue.runnerProvider)}'`);
      continue;
    }

    const target = dynamicLabels.selectQueue({ queue, nonGhrLabels, sanitizedGhrLabels });
    if (target) return target;
  }

  return undefined;
}
