import { createChildLogger } from '@aws-github-runner/aws-powertools-util';

import { createRunnerProviderRegistry } from './core';

import type { DynamicLabelDispatchTarget, RunnerMatcherConfig, WebhookProviderCapabilities } from './contracts';
import { dynamicLabelsForOtherProvider } from './dynamic-labels';
import { resolveRunnerProviderType } from './provider-types';
import { enabledWebhookProviders } from './providers.config.webhook';

const logger = createChildLogger('handler');

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

    if (!queue.matcherConfig.enableDynamicLabels) {
      logger.warn(`Queue ${queue.id} matches non-dynamic labels but does not allow dynamic labels; trying next match`);
      continue;
    }

    const labelsForOtherProvider = dynamicLabelsForOtherProvider(sanitizedGhrLabels, provider);
    if (labelsForOtherProvider.length > 0) {
      logger.warn(`Queue ${queue.id}: dynamic labels target another runner provider; trying next match`, {
        dynamicLabels: labelsForOtherProvider,
      });
      continue;
    }

    const violations = dynamicLabels.getViolations({ queue, labels: sanitizedGhrLabels });
    if (violations.length === 0) {
      return { queue, labels: [...nonGhrLabels, ...sanitizedGhrLabels] };
    }

    for (const violation of violations) {
      logger.warn(
        `Queue ${queue.id}: dynamic label '${violation.label}' is not accepted (${violation.reason}); trying next match`,
      );
    }
  }

  return undefined;
}
