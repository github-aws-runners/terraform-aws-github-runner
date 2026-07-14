import type { ScaleUpRunnerProviderType } from './scale-up-provider';

export function getScaleUpRunnerProviderType(type: string | undefined, defaultType: ScaleUpRunnerProviderType): string {
  return type?.trim() ? type : defaultType;
}
