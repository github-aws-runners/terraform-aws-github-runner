import { createAwsSsmRunnerConfigStore } from './aws/ssm/runner-config-store';
import type { RunnerConfigStore } from './core';
import type {} from './environment';

type RunnerConfigStoreFactory = () => RunnerConfigStore;

const providerFactories = {
  aws_ssm: createAwsSsmRunnerConfigStore,
} as const satisfies Record<string, RunnerConfigStoreFactory>;

type RunnerConfigStorageProvider = keyof typeof providerFactories;

const defaultProvider = 'aws_ssm' satisfies RunnerConfigStorageProvider;

let runnerConfigStore: RunnerConfigStore | undefined;

export function getRunnerConfigStore(): RunnerConfigStore {
  runnerConfigStore ??= providerFactories[resolveProvider(process.env.RUNNER_CONFIG_STORAGE_PROVIDER)]();
  return runnerConfigStore;
}

// Test-only reset for cases that need to exercise first-use environment selection.
export function resetRunnerConfigStore(): void {
  runnerConfigStore = undefined;
}

function resolveProvider(provider: unknown): RunnerConfigStorageProvider {
  if (provider === undefined) {
    return defaultProvider;
  }

  if (typeof provider !== 'string') {
    throw new Error(`Unsupported runner config storage provider '${String(provider)}'`);
  }

  const normalizedProvider = provider.trim().toLowerCase();
  if (normalizedProvider === '') {
    return defaultProvider;
  }

  if (!Object.prototype.hasOwnProperty.call(providerFactories, normalizedProvider)) {
    throw new Error(`Unsupported runner config storage provider '${String(provider)}'`);
  }

  return normalizedProvider as RunnerConfigStorageProvider;
}
