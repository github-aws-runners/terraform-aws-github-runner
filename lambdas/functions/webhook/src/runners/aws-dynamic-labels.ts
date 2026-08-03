import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import type { DynamicLabelDispatchTarget } from '@aws-github-runner/runner-providers';
import { normalizeRunnerProviderType } from '@aws-github-runner/runner-providers/provider-types';
import { webhookProviderRegistry } from '@aws-github-runner/runner-providers/webhook';

import type { RunnerMatcherConfig } from '../sqs';

const logger = createChildLogger('handler');

export function selectAwsDynamicLabelQueue(
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
