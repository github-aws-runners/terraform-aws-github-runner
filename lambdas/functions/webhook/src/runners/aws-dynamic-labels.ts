import { createChildLogger } from '@aws-github-runner/aws-powertools-util';

import { RunnerMatcherConfig, RunnerProvider } from '../sqs';
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
    const provider: RunnerProvider | string = queue.runnerProvider ?? 'ec2';
    const strategy = awsDynamicLabelProviderStrategies.find((strategy) => strategy.type === provider);

    if (!strategy) {
      logger.warn(`Queue ${queue.id} has unsupported runner provider '${provider}'`);
      continue;
    }

    const target = strategy.selectQueue({ queue, nonGhrLabels, sanitizedGhrLabels });
    if (target) return target;
  }

  return undefined;
}
