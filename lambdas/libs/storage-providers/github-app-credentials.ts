import { createAwsSsmGitHubAppCredentialsStore } from './aws/ssm/github-app-credentials-store';
import type { GitHubAppCredentialsStore } from './core';

let githubAppCredentialsStore: GitHubAppCredentialsStore | undefined;

export function getGitHubAppCredentialsStore(): GitHubAppCredentialsStore {
  // GitHub App credentials remain in SSM independently of runner config storage selection.
  githubAppCredentialsStore ??= createAwsSsmGitHubAppCredentialsStore();
  return githubAppCredentialsStore;
}

// Test-only reset for cases that need to exercise first-use environment selection.
export function resetGitHubAppCredentialsStore(): void {
  githubAppCredentialsStore = undefined;
}
