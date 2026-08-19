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
  accessScope?: string;
}

export interface RunnerConfigStore {
  readonly maxWritesPerSecond?: number;
  create(record: RunnerConfigRecord, options?: { metadata?: RunnerConfigMetadata[] }): Promise<void>;
  houseKeeper(): Promise<void>;
}

export interface AwsSsmRunnerConfigStorageEnvironment {
  RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_ssm';
  SSM_TOKEN_PATH: string;
}

export interface AwsDynamoDbRunnerConfigStorageEnvironment {
  RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_dynamodb';
  RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME: string;
}

export type RunnerConfigStorageEnvironment =
  | AwsSsmRunnerConfigStorageEnvironment
  | AwsDynamoDbRunnerConfigStorageEnvironment;

/** Exact environment-variable map accepted from `runHookPayload.context.storage`. */
export type RunnerConfigStorageContext = RunnerConfigStorageEnvironment;

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

export interface RunnerMatcherConfigStore {
  get(): Promise<string>;
}

export type RunnerType = 'Org' | 'Repo';
export type RunnerLifecycleState = 'provisioning' | 'active' | 'orphan' | 'terminating';

export interface RunnerStateRecord {
  runnerId: string;
  computeProvider: string;
  computeResourceId: string;
  runnerName?: string;
  runnerLabels?: string[];
  githubRunnerId?: string;
  runnerOwner: string;
  runnerType: RunnerType;
  state: RunnerLifecycleState;
  createdAt: string;
  updatedAt: string;
  metadata?: RunnerConfigMetadata[];
}

export type CreateRunnerStateRecord = Omit<RunnerStateRecord, 'state' | 'createdAt' | 'updatedAt' | 'githubRunnerId'>;

export interface RunnerStateActivation {
  runnerName?: string;
  runnerLabels?: string[];
  githubRunnerId?: string;
  metadata?: RunnerConfigMetadata[];
}

export type RunnerGitHubIdentity = RunnerStateActivation & { githubRunnerId: string };

export interface RunnerStateFilter {
  computeProvider?: string;
}

/**
 * Provider-neutral index of compute resources that implement GitHub runners.
 * Runner bootstrap configuration is deliberately stored by RunnerConfigStore
 * in a separate item because it contains a short-lived secret payload.
 */
export interface RunnerStateStore {
  create(record: CreateRunnerStateRecord): Promise<void>;
  recordGitHubIdentity(runnerId: string, identity: RunnerGitHubIdentity): Promise<void>;
  activate(runnerId: string, activation?: RunnerStateActivation): Promise<void>;
  list(filter?: RunnerStateFilter): Promise<RunnerStateRecord[]>;
  markOrphan(runnerId: string): Promise<void>;
  unmarkOrphan(runnerId: string): Promise<void>;
  beginTermination(runnerId: string): Promise<RunnerLifecycleState | undefined>;
  cancelTermination(runnerId: string, restoreState: 'provisioning' | 'active' | 'orphan'): Promise<void>;
  delete(runnerId: string): Promise<void>;
}
