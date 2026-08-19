import { createAwsSsmRunnerMatcherConfigStore } from './aws/ssm/runner-matcher-config-store';
import type { RunnerMatcherConfigStore } from './core';
import type {} from './environment';
import { resolveRunnerConfigStorageProvider, type RunnerConfigStorageProvider } from './provider';

type RunnerMatcherConfigStoreFactory = () => RunnerMatcherConfigStore;

const providerFactories = {
  aws_ssm: createAwsSsmRunnerMatcherConfigStore,
} as const satisfies Record<RunnerConfigStorageProvider, RunnerMatcherConfigStoreFactory>;

let runnerMatcherConfigStore: RunnerMatcherConfigStore | undefined;

export function getRunnerMatcherConfigStore(): RunnerMatcherConfigStore {
  runnerMatcherConfigStore ??=
    providerFactories[resolveRunnerConfigStorageProvider(process.env.RUNNER_CONFIG_STORAGE_PROVIDER)]();
  return runnerMatcherConfigStore;
}

// Test-only reset for cases that need to exercise first-use environment selection.
export function resetRunnerMatcherConfigStore(): void {
  runnerMatcherConfigStore = undefined;
}
