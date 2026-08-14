import { computeProviderTypes } from './provider-types';
import type { ComputeProviderType } from './provider-types';

export function createDynamicLabelsForOtherProvider<TProvider extends string>(providerTypes: readonly TProvider[]) {
  return (labels: string[], provider: TProvider): string[] =>
    labels.filter((label) =>
      providerTypes.some((candidate) => candidate !== provider && label.startsWith(`ghr-${candidate}-`)),
    );
}

export const dynamicLabelsForOtherProvider =
  createDynamicLabelsForOtherProvider<ComputeProviderType>(computeProviderTypes);
