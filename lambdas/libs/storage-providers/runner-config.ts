import { createAwsDynamoDbRunnerConfigStore } from './aws/dynamodb/runner-config-store';
import { createAwsSsmRunnerConfigStore } from './aws/ssm/runner-config-store';
import type { RunnerConfigStore } from './core';
import type {} from './environment';
import { resolveRunnerConfigStorageProvider, type RunnerConfigStorageProvider } from './provider';

type RunnerConfigStoreFactory = () => RunnerConfigStore;

const providerFactories = {
  aws_ssm: createAwsSsmRunnerConfigStore,
  aws_dynamodb: createAwsDynamoDbRunnerConfigStore,
} as const satisfies Record<RunnerConfigStorageProvider, RunnerConfigStoreFactory>;

let runnerConfigStore: RunnerConfigStore | undefined;

export function getRunnerConfigStore(): RunnerConfigStore {
  runnerConfigStore ??=
    providerFactories[resolveRunnerConfigStorageProvider(process.env.RUNNER_CONFIG_STORAGE_PROVIDER)]();
  return runnerConfigStore;
}

// Test-only reset for cases that need to exercise first-use environment selection.
export function resetRunnerConfigStore(): void {
  runnerConfigStore = undefined;
}
