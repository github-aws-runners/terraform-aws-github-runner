import { createChildLogger } from '@aws-github-runner/aws-powertools-util';

const logger = createChildLogger('handler');

const GHR_LABEL_MAX_LENGTH = 128;
const GHR_LABEL_VALUE_PATTERN = /^[a-zA-Z0-9._/;\-:]+$/;

export interface WorkflowJobLabels {
  allLabels: string[];
  ghrLabels: string[];
  sanitizedGhrLabels: string[];
  nonGhrLabels: string[];
  hasDynamicLabels: boolean;
}

export function splitWorkflowJobLabels(labels: string[]): WorkflowJobLabels {
  const ghrLabels = labels.filter((label) => label.startsWith('ghr-'));
  const sanitizedGhrLabels = sanitizeGhrLabels(ghrLabels);
  const nonGhrLabels = labels.filter((label) => !label.startsWith('ghr-'));

  return {
    allLabels: labels,
    ghrLabels,
    sanitizedGhrLabels,
    nonGhrLabels,
    hasDynamicLabels: sanitizedGhrLabels.length > 0,
  };
}

export function sanitizeGhrLabels(labels: string[]): string[] {
  return labels.filter((label) => {
    if (label.length > GHR_LABEL_MAX_LENGTH) {
      logger.warn('Dynamic label exceeds max length, stripping', { label: label.substring(0, 40) });
      return false;
    }
    if (!GHR_LABEL_VALUE_PATTERN.test(label)) {
      logger.warn('Dynamic label contains invalid characters, stripping', { label });
      return false;
    }
    return true;
  });
}

/**
 * Pure label match against a runner's `labelMatchers`. Caller is expected to
 * pass only non-dynamic labels.
 */
export function canRunJob(
  workflowJobLabels: string[],
  runnerLabelsMatchers: string[][],
  workflowLabelCheckAll: boolean,
  bidirectionalLabelMatch = false,
): boolean {
  const lowered = runnerLabelsMatchers.map((rl) => rl.map((l) => l.toLowerCase()));

  let match: boolean;
  if (bidirectionalLabelMatch) {
    const workflowLabelsLower = workflowJobLabels.map((wl) => wl.toLowerCase());
    match = lowered.some(
      (rl) => workflowLabelsLower.every((wl) => rl.includes(wl)) && rl.every((r) => workflowLabelsLower.includes(r)),
    );
  } else {
    const matchLabels = workflowLabelCheckAll
      ? lowered.some((rl) => workflowJobLabels.every((wl) => rl.includes(wl.toLowerCase())))
      : lowered.some((rl) => workflowJobLabels.some((wl) => rl.includes(wl.toLowerCase())));
    match = workflowJobLabels.length === 0 ? !matchLabels : matchLabels;
  }

  logger.debug(
    `Received workflow job event with labels: '${JSON.stringify(workflowJobLabels)}'. The event does ${
      match ? '' : 'NOT '
    }match the runner labels: '${Array.from(lowered).join(',')}'`,
  );
  return match;
}
