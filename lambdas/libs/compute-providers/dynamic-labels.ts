import { computeProviderTypes } from './provider-types';

export function dynamicLabelsForOtherProvider(
  labels: string[],
  provider: string,
  providerTypes: readonly string[] = computeProviderTypes,
): string[] {
  return labels.filter((label) =>
    providerTypes.some((candidate) => candidate !== provider && label.startsWith(`ghr-${candidate}-`)),
  );
}
