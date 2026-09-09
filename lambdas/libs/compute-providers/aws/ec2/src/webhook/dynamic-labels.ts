import { createChildLogger } from '@aws-github-runner/aws-powertools-util';

import type { DynamicLabelProvider, RunnerMatcherConfig } from '../../../../contracts';
import { violationsAgainstPolicy } from './dynamic-labels-policy';

const logger = createChildLogger('handler');

function resolveEc2DynamicLabelsPolicy(queue: RunnerMatcherConfig) {
  const hasLegacyEc2DynamicLabelsPolicy = Object.prototype.hasOwnProperty.call(
    queue.matcherConfig,
    'ec2DynamicLabelsPolicy',
  );

  if (queue.matcherConfig.awsDynamicLabelsPolicy == null && hasLegacyEc2DynamicLabelsPolicy) {
    logger.warn(
      `Queue ${queue.id}: using deprecated matcherConfig.ec2DynamicLabelsPolicy; migrate to matcherConfig.awsDynamicLabelsPolicy`,
    );
    return queue.matcherConfig.ec2DynamicLabelsPolicy;
  }

  return queue.matcherConfig.awsDynamicLabelsPolicy;
}

export const ec2DynamicLabelProvider: DynamicLabelProvider = {
  getViolations: ({ queue, labels }) => violationsAgainstPolicy(labels, resolveEc2DynamicLabelsPolicy(queue)),
};
