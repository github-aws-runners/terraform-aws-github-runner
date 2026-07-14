import { normalizeRunnerProviderType } from '@aws-github-runner/runner-provider';
import type { RunnerProviderType } from '@aws-github-runner/runner-provider';

export type { RunnerProviderType } from '@aws-github-runner/runner-provider';

export function resolveRunnerProviderType(type: unknown): RunnerProviderType {
  const normalizedType = normalizeRunnerProviderType(type);
  if (!normalizedType) {
    throw new Error(`Unsupported runner provider type '${String(type)}'`);
  }

  return normalizedType;
}

export interface RunnerProvider {
  type: RunnerProviderType;
}
