import type { ScaleUpRunnerProviderType } from './scale-up-provider';

export function getScaleUpRunnerProviderType(
  type: string | undefined,
  defaultType: ScaleUpRunnerProviderType,
): ScaleUpRunnerProviderType {
  return type ?? defaultType;
}
