import { violationsAgainstAwsDynamicLabelsPolicy } from '../../../dynamic-labels-policy';
import type { DynamicLabelProvider } from '../../../../contracts';
import { MICROVM_DYNAMIC_LABEL_PREFIX, parseMicrovmDynamicLabels } from '../dynamic-labels';

export const microvmDynamicLabelProvider: DynamicLabelProvider = {
  getViolations: ({ queue, labels }) => {
    const parsedLabels = parseMicrovmDynamicLabels(labels);
    const policyViolations = violationsAgainstAwsDynamicLabelsPolicy(
      labels,
      queue.matcherConfig.awsDynamicLabelsPolicy,
      MICROVM_DYNAMIC_LABEL_PREFIX,
    );

    return [...parsedLabels.violations, ...policyViolations];
  },
};
