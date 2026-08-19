export interface GitHubAppCredential {
  appId: number;
  privateKey: string;
  installationId?: number;
}

export interface GitHubAppCredentialsStore {
  get(): Promise<GitHubAppCredential[]>;
}

export interface GitHubWebhookSecretStore {
  get(): Promise<string>;
}

export interface RunnerConfigMetadata {
  key: string;
  value: string;
}

export interface RunnerConfigRecord {
  runnerId: string;
  value: string;
}

export interface RunnerConfigStore {
  readonly maxWritesPerSecond?: number;
  create(record: RunnerConfigRecord, options?: { metadata?: RunnerConfigMetadata[] }): Promise<void>;
  houseKeeper(): Promise<void>;
}

export interface RunnerGroupCacheRecord {
  runnerGroupName: string;
  runnerGroupId: number;
}

export interface RunnerGroupCacheStore {
  get(runnerGroupName: string): Promise<number | undefined>;
  create(record: RunnerGroupCacheRecord): Promise<void>;
}

export interface RunnerMatcherConfigStore {
  get(): Promise<string>;
}
