import type { GitHubAppCredential, GitHubAppCredentialsStore } from '../../core';
import { getDurableConfigValue } from './durable-config';
import { requiredEnvironmentValue } from './environment';
import { GITHUB_APP_CREDENTIALS_ID, GITHUB_APP_SCOPE } from './keys';

interface StoredGitHubAppCredential {
  appId: number;
  privateKeyBase64: string;
  installationId?: number;
}

export function createAwsDynamoDbGitHubAppCredentialsStore(): GitHubAppCredentialsStore {
  return new AwsDynamoDbGitHubAppCredentialsStore(requiredEnvironmentValue('RUNNER_CONFIG_DYNAMODB_CONFIG_TABLE_NAME'));
}

class AwsDynamoDbGitHubAppCredentialsStore implements GitHubAppCredentialsStore {
  constructor(private readonly tableName: string) {}

  async get(): Promise<GitHubAppCredential[]> {
    const value = await getDurableConfigValue(
      this.tableName,
      GITHUB_APP_SCOPE,
      GITHUB_APP_CREDENTIALS_ID,
      'GitHub App credentials',
    );
    const credentials = parseCredentials(value);

    return credentials.map((credential) => ({
      appId: credential.appId,
      privateKey: decodePrivateKey(credential.privateKeyBase64),
      installationId: credential.installationId,
    }));
  }
}

function parseCredentials(value: string): StoredGitHubAppCredential[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('GitHub App credentials item contains invalid JSON');
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('GitHub App credentials item must contain a non-empty array');
  }

  return parsed.map((credential, index) => parseCredential(credential, index));
}

function parseCredential(value: unknown, index: number): StoredGitHubAppCredential {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidCredential(index);
  }

  const credential = value as Record<string, unknown>;
  if (!isPositiveSafeInteger(credential.appId) || !isValidBase64(credential.privateKeyBase64)) {
    throw invalidCredential(index);
  }
  if (credential.installationId !== undefined && !isPositiveSafeInteger(credential.installationId)) {
    throw invalidCredential(index);
  }

  return {
    appId: credential.appId,
    privateKeyBase64: credential.privateKeyBase64,
    installationId: credential.installationId,
  };
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isValidBase64(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0) {
    return false;
  }

  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

function decodePrivateKey(privateKeyBase64: string): string {
  return Buffer.from(privateKeyBase64, 'base64').toString().replace(/\\n/g, '\n');
}

function invalidCredential(index: number): Error {
  return new Error(`GitHub App credential at index ${index} has an invalid stored value`);
}
