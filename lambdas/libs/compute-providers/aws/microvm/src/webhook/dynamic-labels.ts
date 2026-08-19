import type { DynamicLabelProvider } from '../../../../contracts';
import { violationsAgainstAwsDynamicLabelsPolicy } from '../../../dynamic-labels-policy';
import { MICROVM_DYNAMIC_LABEL_PREFIX, parseMicrovmDynamicLabels } from '../dynamic-labels';

const RESOURCE_BOUNDARY_KEYS = new Set(['egress-network-connectors', 'image-arn', 'image-version']);

function resourceBoundaryViolations(
  labels: string[],
  policy: Parameters<typeof violationsAgainstAwsDynamicLabelsPolicy>[1],
) {
  return labels.flatMap((label) => {
    if (!label.startsWith(MICROVM_DYNAMIC_LABEL_PREFIX)) return [];

    const key = label.slice(MICROVM_DYNAMIC_LABEL_PREFIX.length).split(':', 1)[0];
    if (!RESOURCE_BOUNDARY_KEYS.has(key) || policy?.blocked_keys?.includes(key)) return [];

    const allowed = policy?.restricted_keys?.[key]?.allowed;
    return allowed && allowed.length > 0 ? [] : [{ label, reason: `key '${key}' requires an explicit allowed list` }];
  });
}

export const microvmDynamicLabelProvider: DynamicLabelProvider = {
  getViolations: ({ queue, labels }) => [
    ...parseMicrovmDynamicLabels(labels).violations,
    ...resourceBoundaryViolations(labels, queue.matcherConfig.awsDynamicLabelsPolicy),
    ...violationsAgainstAwsDynamicLabelsPolicy(
      labels,
      queue.matcherConfig.awsDynamicLabelsPolicy,
      MICROVM_DYNAMIC_LABEL_PREFIX,
    ),
  ],
};
