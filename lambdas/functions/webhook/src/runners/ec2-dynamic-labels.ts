import { createChildLogger } from '@aws-github-runner/aws-powertools-util';

import { RunnerMatcherConfig } from '../sqs';
import { AwsDynamicLabelDispatchTarget, AwsDynamicLabelProviderStrategy } from './aws-dynamic-labels-provider';
import { violationsAgainstPolicy } from './ec2-dynamic-labels-policy';

const logger = createChildLogger('handler');

export type Ec2DynamicLabelDispatchTarget = AwsDynamicLabelDispatchTarget;

function resolveEc2DynamicLabelsPolicy(queue: RunnerMatcherConfig) {
  const hasAwsDynamicLabelsPolicy = Object.prototype.hasOwnProperty.call(queue.matcherConfig, 'awsDynamicLabelsPolicy');
  const hasLegacyEc2DynamicLabelsPolicy = Object.prototype.hasOwnProperty.call(
    queue.matcherConfig,
    'ec2DynamicLabelsPolicy',
  );

  if (!hasAwsDynamicLabelsPolicy && hasLegacyEc2DynamicLabelsPolicy) {
    logger.warn(
      `Queue ${queue.id}: using deprecated matcherConfig.ec2DynamicLabelsPolicy; migrate to matcherConfig.awsDynamicLabelsPolicy`,
    );
    return queue.matcherConfig.ec2DynamicLabelsPolicy;
  }

  return queue.matcherConfig.awsDynamicLabelsPolicy;
}

export function selectEc2DynamicLabelQueue(
  matches: RunnerMatcherConfig[],
  nonGhrLabels: string[],
  sanitizedGhrLabels: string[],
): Ec2DynamicLabelDispatchTarget | undefined {
  for (const queue of matches) {
    if (!queue.matcherConfig.enableDynamicLabels) {
      logger.warn(`Queue ${queue.id} matches non-dynamic labels but does not allow dynamic labels; trying next match`);
      continue;
    }

    const violations = violationsAgainstPolicy(sanitizedGhrLabels, resolveEc2DynamicLabelsPolicy(queue));
    if (violations.length === 0) {
      return {
        queue,
        labels: [...nonGhrLabels, ...sanitizedGhrLabels],
      };
    }

    for (const violation of violations) {
      logger.warn(
        `Queue ${queue.id}: dynamic label '${violation.label}' does not match policy (${violation.reason}); trying next match`,
      );
    }
  }

  return undefined;
}

export const ec2DynamicLabelProviderStrategy: AwsDynamicLabelProviderStrategy = {
  type: 'ec2',
  selectQueue: ({ queue, nonGhrLabels, sanitizedGhrLabels }) =>
    selectEc2DynamicLabelQueue([queue], nonGhrLabels, sanitizedGhrLabels),
};
