import { createAwsSsmGitHubWebhookSecretStore } from './aws/ssm/github-webhook-secret-store';
import type { GitHubWebhookSecretStore } from './core';

let githubWebhookSecretStore: GitHubWebhookSecretStore | undefined;

export function getGitHubWebhookSecretStore(): GitHubWebhookSecretStore {
  // The webhook secret remains in SSM independently of runner config storage selection.
  githubWebhookSecretStore ??= createAwsSsmGitHubWebhookSecretStore();
  return githubWebhookSecretStore;
}

// Test-only reset for cases that need to exercise first-use environment selection.
export function resetGitHubWebhookSecretStore(): void {
  githubWebhookSecretStore = undefined;
}
