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
}

export interface RunnerConfigHousekeeper {
  houseKeeper(): Promise<void>;
}

export interface GitHubAppCredential {
  appId: number;
  privateKey: string;
  installationId?: number;
}

export interface GitHubAppCredentialsStore {
  get(): Promise<GitHubAppCredential[]>;
}

export interface RunnerConfigConsumeOptions {
  /** Absolute Unix time in milliseconds after which the operation must stop. */
  deadlineMs: number;
  signal: AbortSignal;
}

export interface RunnerConfigConsumer {
  consume(runnerId: string, options: RunnerConfigConsumeOptions): Promise<string>;
}

export interface RunnerGroupCacheRecord {
  runnerGroupName: string;
  runnerGroupId: number;
}

export interface RunnerGroupCacheStore {
  get(runnerGroupName: string): Promise<number | undefined>;
  create(record: RunnerGroupCacheRecord): Promise<void>;
}
