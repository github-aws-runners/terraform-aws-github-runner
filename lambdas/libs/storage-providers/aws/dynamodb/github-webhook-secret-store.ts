import type { GitHubWebhookSecretStore } from '../../core';
import { getDurableConfigValue } from './durable-config';
import { requiredEnvironmentValue } from './environment';
import { GITHUB_WEBHOOK_SCOPE, GITHUB_WEBHOOK_SECRET_ID } from './keys';

export function createAwsDynamoDbGitHubWebhookSecretStore(): GitHubWebhookSecretStore {
  return new AwsDynamoDbGitHubWebhookSecretStore(requiredEnvironmentValue('RUNNER_CONFIG_DYNAMODB_CONFIG_TABLE_NAME'));
}

class AwsDynamoDbGitHubWebhookSecretStore implements GitHubWebhookSecretStore {
  constructor(private readonly tableName: string) {}

  async get(): Promise<string> {
    return await getDurableConfigValue(
      this.tableName,
      GITHUB_WEBHOOK_SCOPE,
      GITHUB_WEBHOOK_SECRET_ID,
      'GitHub webhook secret',
    );
  }
}
