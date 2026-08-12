import { computeProviderTypes } from './provider-types';
import type { ComputeProviderType } from './provider-types';

export function dynamicLabelsForOtherProvider(labels: string[], provider: ComputeProviderType): string[] {
  return labels.filter((label) =>
    computeProviderTypes.some((candidate) => candidate !== provider && label.startsWith(`ghr-${candidate}-`)),
  );
}
