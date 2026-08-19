import { createAwsSsmGitHubWebhookSecretStore } from './aws/ssm/github-webhook-secret-store';
import type { GitHubWebhookSecretStore } from './core';
import type {} from './environment';
import { resolveRunnerConfigStorageProvider, type RunnerConfigStorageProvider } from './provider';

type GitHubWebhookSecretStoreFactory = () => GitHubWebhookSecretStore;

const providerFactories = {
  aws_ssm: createAwsSsmGitHubWebhookSecretStore,
} as const satisfies Record<RunnerConfigStorageProvider, GitHubWebhookSecretStoreFactory>;

let githubWebhookSecretStore: GitHubWebhookSecretStore | undefined;

export function getGitHubWebhookSecretStore(): GitHubWebhookSecretStore {
  githubWebhookSecretStore ??=
    providerFactories[resolveRunnerConfigStorageProvider(process.env.RUNNER_CONFIG_STORAGE_PROVIDER)]();
  return githubWebhookSecretStore;
}

// Test-only reset for cases that need to exercise first-use environment selection.
export function resetGitHubWebhookSecretStore(): void {
  githubWebhookSecretStore = undefined;
}
