import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import type { DynamicLabelDispatchTarget } from '@aws-github-runner/compute-providers';
import { normalizeComputeProviderType } from '@aws-github-runner/compute-providers/provider-types';
import { webhookProviderRegistry } from '@aws-github-runner/compute-providers/webhook';

import type { RunnerMatcherConfig } from '../sqs';

const logger = createChildLogger('handler');

export function selectAwsDynamicLabelQueue(
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
