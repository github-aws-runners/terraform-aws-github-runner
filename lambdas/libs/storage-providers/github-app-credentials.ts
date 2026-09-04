import { createAwsSsmGitHubAppCredentialsStore } from './aws/ssm/github-app-credentials-store';
import type { GitHubAppCredentialsStore } from './core';

export function createGitHubAppCredentialsStore(): GitHubAppCredentialsStore {
  return createAwsSsmGitHubAppCredentialsStore();
}
