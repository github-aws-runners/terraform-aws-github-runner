import { getParameter } from '@aws-github-runner/aws-ssm-util';

import type { GitHubWebhookSecretStore } from '../../core';
import type {} from './environment';

export function createAwsSsmGitHubWebhookSecretStore(): GitHubWebhookSecretStore {
  const parameterPath = process.env.PARAMETER_GITHUB_APP_WEBHOOK_SECRET;
  if (!parameterPath || parameterPath.trim() === '') {
    throw new Error('Environment variable PARAMETER_GITHUB_APP_WEBHOOK_SECRET is not set');
  }

  return new AwsSsmGitHubWebhookSecretStore(parameterPath);
}

class AwsSsmGitHubWebhookSecretStore implements GitHubWebhookSecretStore {
  constructor(private readonly parameterPath: string) {}

  async get(): Promise<string> {
    try {
      return await getParameter(this.parameterPath);
    } catch (error) {
      throw new Error(
        `Failed to load parameter for webhookSecret from path ${this.parameterPath}: ${(error as Error).message}`,
      );
    }
  }
}
