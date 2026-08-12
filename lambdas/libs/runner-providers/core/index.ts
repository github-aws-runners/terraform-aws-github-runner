import type { Octokit } from '@octokit/rest';

import type { RunnerProviderType } from '../provider-types';

export interface RunnerProvider {
  type: RunnerProviderType;
}

export type LambdaRunnerSource = 'scale-up-lambda' | 'pool-lambda';
export type GitHubRunnerType = 'Org' | 'Repo';
export type RunnerConfigStorageBackend = 'ssm' | 'dynamodb';

export interface RunnerConfigStorage {
  backend: RunnerConfigStorageBackend;
  dynamodb?: {
    tableName: string;
    partitionKeyName?: string;
    valueAttributeName?: string;
    configKeyPrefix?: string;
    consistentRead?: boolean;
    tokenOverwriteProtectionEnabled?: boolean;
    tokenKeyPrefix: string;
    tokenTtlSeconds: number;
    ttlAttributeName?: string;
  };
}

export interface CreateGitHubRunnerConfig {
  ephemeral: boolean;
  ghesBaseUrl?: string;
  enableJitConfig: boolean;
  runnerLabels: string;
  runnerGroup: string;
  runnerNamePrefix: string;
  runnerOwner: string;
  runnerType: GitHubRunnerType;
  disableAutoUpdate: boolean;
  ssmTokenPath: string;
  ssmConfigPath: string;
  ssmParameterStoreTags: { Key: string; Value: string }[];
  runnerConfigStorage?: RunnerConfigStorage;
}

export interface GitHubRunnerMetadata {
  githubRunnerId: string;
  runnerLabels: string[];
}

export interface StartRunnerConfigOptions {
  getSsmParameterTags?: (runnerId: string) => { Key: string; Value: string }[];
  onJitConfigCreated?: (runnerId: string, metadata: GitHubRunnerMetadata) => Promise<void>;
}

export type CreateStartRunnerConfig = (
  githubRunnerConfig: CreateGitHubRunnerConfig,
  runnerIds: string[],
  ghClient: Octokit,
  options?: StartRunnerConfigOptions,
) => Promise<string[]>;

export interface CurrentRunnersInput {
  runnerType: GitHubRunnerType;
  runnerOwner: string;
}

export interface CreateScaleUpRunnersInput<TState = unknown> {
  githubRunnerConfig: CreateGitHubRunnerConfig;
  numberOfRunners: number;
  githubInstallationClient: Octokit;
  state: TState;
}

export interface PreparedScaleUpRunnerGroup<TState = unknown> {
  runnerLabels: string[];
  state: TState;
}

export interface CreateScaleUpRunnersResult {
  instances: string[];
  retryableErrorCount: number;
  nonRetryableErrorCount: number;
}

export interface ScaleUpRunnerProvider<TState = unknown> extends RunnerProvider {
  prepareGroup(messageLabels: string[]): Promise<PreparedScaleUpRunnerGroup<TState>>;
  getCurrentRunners(state: TState, input: CurrentRunnersInput): Promise<number>;
  createRunners(input: CreateScaleUpRunnersInput<TState>): Promise<CreateScaleUpRunnersResult>;
}

export interface ScaleDownRunnerList {
  id: string;
  launchTime?: Date;
  owner?: string;
  type?: string;
  repo?: string;
  org?: string;
  orphan?: boolean;
  githubRunnerId?: string;
  bypassRemoval?: boolean;
}

export interface ScaleDownRunnerInfo extends ScaleDownRunnerList {
  owner: string;
  type: string;
}

export interface ScaleDownRunnerProvider extends RunnerProvider {
  list(environment: string, orphan?: boolean): Promise<ScaleDownRunnerList[]>;
  bootTimeExceeded(runner: ScaleDownRunnerInfo): boolean;
  markOrphan(id: string): Promise<void>;
  unmarkOrphan(id: string): Promise<void>;
  terminate(id: string): Promise<void>;
}

export interface RunnerStatus {
  busy: boolean;
  status: string;
}

export interface ListPoolRunnersInput {
  environment: string;
  runnerOwner: string;
  runnerType: GitHubRunnerType;
}

export interface CreatePoolRunnersInput {
  githubRunnerConfig: CreateGitHubRunnerConfig;
  numberOfRunners: number;
  githubInstallationClient: Octokit;
}

export interface PoolRunnerProvider<TRunner = unknown> extends RunnerProvider {
  listRunners(input: ListPoolRunnersInput): Promise<TRunner[]>;
  countAvailableRunners(
    runners: TRunner[],
    runnerStatus: Map<string, RunnerStatus>,
    includeBusyRunners: boolean,
  ): number;
  createRunners(input: CreatePoolRunnersInput): Promise<string[]>;
}

export interface RunnerProviderPlugin<TCapabilities, TType extends string = string> {
  type: TType;
  capabilities: TCapabilities;
}

export function createRunnerProviderRegistry<TCapabilities, TType extends string = RunnerProviderType>(
  plugins: readonly RunnerProviderPlugin<TCapabilities, TType>[],
) {
  const pluginsByType = new Map(plugins.map((plugin) => [plugin.type, plugin]));

  function get(type: TType): RunnerProviderPlugin<TCapabilities, TType> {
    const plugin = pluginsByType.get(type);
    if (!plugin) throw new Error(`No runner provider plugin registered for '${type}'`);
    return plugin;
  }

  return {
    get,
    capability: <TKey extends keyof TCapabilities>(type: TType, capability: TKey): TCapabilities[TKey] =>
      get(type).capabilities[capability],
  };
}
