import { createAwsSsmRunnerGroupCacheStore } from './aws/ssm/runner-group-cache-store';
import type { RunnerGroupCacheStore } from './core';
import type {} from './environment';
import { resolveRunnerConfigStorageProvider, type RunnerConfigStorageProvider } from './provider';

type RunnerGroupCacheStoreFactory = () => RunnerGroupCacheStore;

const providerFactories = {
  aws_ssm: createAwsSsmRunnerGroupCacheStore,
} as const satisfies Record<RunnerConfigStorageProvider, RunnerGroupCacheStoreFactory>;

let runnerGroupCacheStore: RunnerGroupCacheStore | undefined;

export function getRunnerGroupCacheStore(): RunnerGroupCacheStore {
  runnerGroupCacheStore ??=
    providerFactories[resolveRunnerConfigStorageProvider(process.env.RUNNER_CONFIG_STORAGE_PROVIDER)]();
  return runnerGroupCacheStore;
}

// Test-only reset for cases that need to exercise first-use environment selection.
export function resetRunnerGroupCacheStore(): void {
  runnerGroupCacheStore = undefined;
}
