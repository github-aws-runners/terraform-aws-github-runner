import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { normalizeRunnerProviderType } from '@aws-github-runner/runner-provider';

import type { RunnerMatcherConfig } from '../sqs';
import { AwsDynamicLabelDispatchTarget, AwsDynamicLabelProviderStrategy } from './aws-dynamic-labels-provider';
import { ec2DynamicLabelProviderStrategy } from './ec2-dynamic-labels';

const logger = createChildLogger('handler');

const awsDynamicLabelProviderStrategies: AwsDynamicLabelProviderStrategy[] = [ec2DynamicLabelProviderStrategy];

export function selectAwsDynamicLabelQueue(
  matches: RunnerMatcherConfig[],
  nonGhrLabels: string[],
  sanitizedGhrLabels: string[],
): AwsDynamicLabelDispatchTarget | undefined {
  for (const queue of matches) {
    const provider = normalizeRunnerProviderType(queue.runnerProvider);
    const strategy = provider
      ? awsDynamicLabelProviderStrategies.find((strategy) => strategy.type === provider)
      : undefined;

    if (!strategy) {
      logger.warn(`Queue ${queue.id} has unsupported runner provider '${provider ?? String(queue.runnerProvider)}'`);
      continue;
    }

    const target = strategy.selectQueue({ queue, nonGhrLabels, sanitizedGhrLabels });
    if (target) return target;
  }

  return undefined;
}
