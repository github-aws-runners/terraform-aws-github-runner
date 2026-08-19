import { createAwsDynamoDbGitHubAppCredentialsStore } from './aws/dynamodb/github-app-credentials-store';
import { createAwsSsmGitHubAppCredentialsStore } from './aws/ssm/github-app-credentials-store';
import type { GitHubAppCredentialsStore } from './core';
import type {} from './environment';
import { resolveRunnerConfigStorageProvider, type RunnerConfigStorageProvider } from './provider';

type GitHubAppCredentialsStoreFactory = () => GitHubAppCredentialsStore;

const providerFactories = {
  aws_ssm: createAwsSsmGitHubAppCredentialsStore,
  aws_dynamodb: createAwsDynamoDbGitHubAppCredentialsStore,
} as const satisfies Record<RunnerConfigStorageProvider, GitHubAppCredentialsStoreFactory>;

let githubAppCredentialsStore: GitHubAppCredentialsStore | undefined;

export function getGitHubAppCredentialsStore(): GitHubAppCredentialsStore {
  githubAppCredentialsStore ??=
    providerFactories[resolveRunnerConfigStorageProvider(process.env.RUNNER_CONFIG_STORAGE_PROVIDER)]();
  return githubAppCredentialsStore;
}

// Test-only reset for cases that need to exercise first-use environment selection.
export function resetGitHubAppCredentialsStore(): void {
  githubAppCredentialsStore = undefined;
}
