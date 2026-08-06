import { createChildLogger } from '@aws-github-runner/aws-powertools-util';

import type { DynamicLabelDispatchTarget, DynamicLabelProvider, RunnerMatcherConfig } from '../../../../contracts';
import { MICROVM_DYNAMIC_LABEL_PREFIX, parseMicrovmDynamicLabels } from '../dynamic-labels';
import { violationsAgainstAwsDynamicLabelsPolicy } from './dynamic-labels-policy';

const logger = createChildLogger('handler');

export function selectMicrovmDynamicLabelQueue(
  matches: RunnerMatcherConfig[],
  nonGhrLabels: string[],
  sanitizedGhrLabels: string[],
): DynamicLabelDispatchTarget | undefined {
  for (const queue of matches) {
    if (!queue.matcherConfig.enableDynamicLabels) {
      logger.warn(`Queue ${queue.id} matches non-dynamic labels but does not allow dynamic labels; trying next match`);
      continue;
    }

    const parsedLabels = parseMicrovmDynamicLabels(sanitizedGhrLabels);
    const policyViolations = violationsAgainstAwsDynamicLabelsPolicy(
      sanitizedGhrLabels,
      queue.matcherConfig.awsDynamicLabelsPolicy,
      MICROVM_DYNAMIC_LABEL_PREFIX,
    );
    const violations = [...parsedLabels.violations, ...policyViolations];

    if (violations.length === 0) {
      return {
        queue,
        labels: [...nonGhrLabels, ...sanitizedGhrLabels],
      };
    }

    for (const violation of violations) {
      logger.warn(
        `Queue ${queue.id}: dynamic label '${violation.label}' is not accepted (${violation.reason}); trying next match`,
      );
    }
  }

  return undefined;
}

export const microvmDynamicLabelProvider: DynamicLabelProvider = {
  selectQueue: ({ queue, nonGhrLabels, sanitizedGhrLabels }) =>
    selectMicrovmDynamicLabelQueue([queue], nonGhrLabels, sanitizedGhrLabels),
};
