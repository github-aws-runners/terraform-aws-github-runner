import { createAwsDynamoDbRunnerStateStore } from './aws/dynamodb/runner-state-store';
import type { RunnerStateStore } from './core';
import type {} from './environment';
import { resolveRunnerConfigStorageProvider } from './provider';

let runnerStateStore: RunnerStateStore | undefined;

export function getRunnerStateStore(): RunnerStateStore | undefined {
  if (runnerStateStore) {
    return runnerStateStore;
  }

  const provider = resolveRunnerConfigStorageProvider(process.env.RUNNER_CONFIG_STORAGE_PROVIDER);
  if (provider !== 'aws_dynamodb') {
    return undefined;
  }

  runnerStateStore = createAwsDynamoDbRunnerStateStore();
  return runnerStateStore;
}

// Test-only reset for cases that need to exercise first-use environment selection.
export function resetRunnerStateStore(): void {
  runnerStateStore = undefined;
}
