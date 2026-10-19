import { createChildLogger } from '@aws-github-runner/aws-powertools-util';

import { createComputeProviderRegistry } from './core';

import type {
  DynamicLabelDispatchTarget,
  DynamicLabelProvider,
  RunnerMatcherConfig,
  WebhookProviderCapabilities,
} from './contracts';
import { dynamicLabelsForOtherProvider } from './dynamic-labels';
import { resolveComputeProviderType } from './provider-types';
import { enabledWebhookProviders } from './providers.config.webhook';

const logger = createChildLogger('handler');

export const webhookProviderRegistry = createComputeProviderRegistry<WebhookProviderCapabilities>(
  enabledWebhookProviders.map((provider) => provider.createPlugin()),
);

export function createDynamicLabelQueueSelector<TProvider extends string>(dependencies: {
  resolveProvider(queue: RunnerMatcherConfig): { type: TProvider; dynamicLabels: DynamicLabelProvider };
  dynamicLabelsForOtherProvider(labels: string[], provider: TProvider): string[];
}) {
  return (
    matches: RunnerMatcherConfig[],
    nonGhrLabels: string[],
    sanitizedGhrLabels: string[],
  ): DynamicLabelDispatchTarget | undefined => {
    for (const queue of matches) {
      const { type: provider, dynamicLabels } = dependencies.resolveProvider(queue);

      if (!queue.matcherConfig.enableDynamicLabels) {
        logger.warn(
          `Queue ${queue.id} matches non-dynamic labels but does not allow dynamic labels; trying next match`,
        );
        continue;
      }

      const labelsForOtherProvider = dependencies.dynamicLabelsForOtherProvider(sanitizedGhrLabels, provider);
      if (labelsForOtherProvider.length > 0) {
        logger.warn(`Queue ${queue.id}: dynamic labels target another compute provider; trying next match`, {
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
  };
}

export const selectDynamicLabelQueue = createDynamicLabelQueueSelector({
  resolveProvider: (queue) => {
    const type = resolveComputeProviderType(queue.computeProvider);
    return { type, dynamicLabels: webhookProviderRegistry.capability(type, 'dynamicLabels') };
  },
  dynamicLabelsForOtherProvider,
});
