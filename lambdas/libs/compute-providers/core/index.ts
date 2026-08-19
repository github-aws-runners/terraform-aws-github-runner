import type { Octokit } from '@octokit/rest';

import type { ComputeProviderType } from '../provider-types';

export interface ComputeProvider {
  type: ComputeProviderType;
}

export type RunnerSource = 'scale-up-lambda' | 'pool-lambda';
export type RunnerType = 'Org' | 'Repo';

export interface CreateGitHubRunnerConfig {
  /** Index of the GitHub App selected for this flow; used to attribute rate-limit metrics per app. */
  appIndex?: number;
  ephemeral: boolean;
  ghesBaseUrl?: string;
  enableJitConfig: boolean;
  runnerLabels: string;
  runnerGroup: string;
  runnerNamePrefix: string;
  runnerOwner: string;
  runnerType: RunnerType;
  disableAutoUpdate: boolean;
}

export interface GitHubRunnerMetadata {
  githubRunnerId: string;
  runnerLabels: string[];
}

export interface StartRunnerConfigOptions {
  runnerConfigStore?: import('@aws-github-runner/storage-providers').RunnerConfigStore;
  runnerGroupCacheStore?: import('@aws-github-runner/storage-providers').RunnerGroupCacheStore;
  /** Compute provider that owns the runner IDs. Used by provider-neutral runner inventory. */
  computeProvider?: ComputeProviderType;
  /** Access scope used by secret stores to isolate one runner's bootstrap configuration. */
  getRunnerConfigAccessScope?: (runnerId: string) => string | undefined;
  getRunnerConfigMetadata?: (runnerId: string) => { key: string; value: string }[];
  onJitConfigCreated?: (runnerId: string, metadata: GitHubRunnerMetadata) => Promise<void>;
}

export type CreateStartRunnerConfig = (
  githubRunnerConfig: CreateGitHubRunnerConfig,
  runnerIds: string[],
  ghClient: Octokit,
  options?: StartRunnerConfigOptions,
) => Promise<string[]>;

export interface CurrentRunnersInput {
  runnerType: RunnerType;
  runnerOwner: string;
}

export interface CreateScaleUpRunnersInput<TState = unknown> {
  githubRunnerConfig: CreateGitHubRunnerConfig;
  numberOfRunners: number;
  githubInstallationClient: Octokit;
  state: TState;
  storage?: import('@aws-github-runner/storage-providers').RunnerConfigStorage;
}

export interface RunnerLabelResolution<TState = unknown> {
  runnerLabels: string[];
  state: TState;
}

/** Signals that runner labels are permanently invalid and must not be retried. */
export class InvalidRunnerLabelsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRunnerLabelsError';
  }
}

export interface CreateRunnerResult {
  instances: string[];
  retryableErrorCount: number;
  nonRetryableErrorCount: number;
}

export interface ScaleUpComputeProvider<TState = unknown> extends ComputeProvider {
  resolveLabelsForRunners(messageLabels: string[]): Promise<RunnerLabelResolution<TState>>;
  /** Compute resource IDs currently owned by this runner entry. */
  getCurrentRunners(state: TState, input: CurrentRunnersInput): Promise<string[]>;
  createRunners(input: CreateScaleUpRunnersInput<TState>): Promise<CreateRunnerResult>;
}

export interface RunnerInfo {
  id: string;
  launchTime?: Date;
  owner: string;
  type: RunnerType;
  repo?: string;
  org?: string;
  orphan?: boolean;
  githubRunnerId?: string;
  bypassRemoval?: boolean;
  /**
   * When scale-down first observed this runner reporting idle, as an ISO-8601 string.
   * Set and cleared via `markIdle` / `unmarkIdle`; absent when no marker is recorded.
   */
  idleDetectedAt?: string;
}

export interface ListRunnerFilters {
  runnerType?: RunnerType;
  runnerOwner?: string;
  environment?: string;
  orphan?: boolean;
}

export interface ScaleDownComputeProvider extends ComputeProvider {
  list(environment: string, orphan?: boolean): Promise<RunnerInfo[]>;
  bootTimeExceeded(runner: RunnerInfo): boolean;
  markOrphan(id: string): Promise<void>;
  unmarkOrphan(id: string): Promise<void>;
  terminate(id: string): Promise<void>;
  /**
   * Record that the runner was observed idle at `at` (ISO-8601), so a later cycle can tell
   * how long it has read idle. Surfaces back on `RunnerInfo.idleDetectedAt`. Only called
   * when the idle-confirmation window (SCALE_DOWN_IDLE_CONFIRMATION_SECONDS) is enabled.
   */
  markIdle(id: string, at: string): Promise<void>;
  /** Clear the idle marker — the runner was seen busy again, so the window restarts. */
  unmarkIdle(id: string): Promise<void>;
}

export interface RunnerStatus {
  busy: boolean;
  status: string;
}

export interface ListPoolRunnersInput {
  environment: string;
  runnerOwner: string;
  runnerType: RunnerType;
}

export interface CreatePoolRunnersInput {
  githubRunnerConfig: CreateGitHubRunnerConfig;
  numberOfRunners: number;
  githubInstallationClient: Octokit;
  storage?: import('@aws-github-runner/storage-providers').RunnerConfigStorage;
}

export interface PoolComputeProvider<TRunner extends { id: string } = { id: string }> extends ComputeProvider {
  listRunners(input: ListPoolRunnersInput): Promise<TRunner[]>;
  countAvailableRunners(
    runners: TRunner[],
    runnerStatus: Map<string, RunnerStatus>,
    includeBusyRunners: boolean,
  ): number;
  createRunners(input: CreatePoolRunnersInput): Promise<string[]>;
}

export interface ComputeProviderPlugin<TCapabilities, TType extends string = string> {
  type: TType;
  capabilities: TCapabilities;
}

export function createComputeProviderRegistry<TCapabilities, TType extends string = ComputeProviderType>(
  plugins: readonly ComputeProviderPlugin<TCapabilities, TType>[],
) {
  const pluginsByType = new Map(plugins.map((plugin) => [plugin.type, plugin]));

  function get(type: TType): ComputeProviderPlugin<TCapabilities, TType> {
    const plugin = pluginsByType.get(type);
    if (!plugin) throw new Error(`No compute provider plugin registered for '${type}'`);
    return plugin;
  }

  return {
    get,
    capability: <TKey extends keyof TCapabilities>(type: TType, capability: TKey): TCapabilities[TKey] =>
      get(type).capabilities[capability],
  };
}
