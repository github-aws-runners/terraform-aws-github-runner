import { runnerProviderTypes } from './provider-types';
import type { RunnerProviderType } from './provider-types';

export function dynamicLabelsForOtherProvider(labels: string[], provider: RunnerProviderType): string[] {
  return labels.filter((label) =>
    runnerProviderTypes.some((candidate) => candidate !== provider && label.startsWith(`ghr-${candidate}-`)),
  );
}
