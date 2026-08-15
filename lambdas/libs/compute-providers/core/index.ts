import type { Octokit } from '@octokit/rest';

import type { ComputeProviderType } from '../provider-types';

export interface ComputeProvider {
  type: ComputeProviderType;
}

export type LambdaRunnerSource = 'scale-up-lambda' | 'pool-lambda' | 'scale-set-lambda';
export type RunnerType = 'Org' | 'Repo';
export type ScaleSetRunnerState = 'provisioning' | 'publishing' | 'config-published' | 'ready' | 'retiring' | 'stopped';

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
  ssmTokenPath: string;
  ssmConfigPath: string;
  ssmParameterStoreTags: { Key: string; Value: string }[];
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
  runnerType: RunnerType;
  runnerOwner: string;
}

export interface CreateScaleUpRunnersInput<TState = unknown> {
  githubRunnerConfig: CreateGitHubRunnerConfig;
  numberOfRunners: number;
  githubInstallationClient: Octokit;
  state: TState;
}

export interface RunnerLabelResolution<TState = unknown> {
  runnerLabels: string[];
  state: TState;
}

export interface CreateRunnerResult {
  instances: string[];
  retryableErrorCount: number;
  nonRetryableErrorCount: number;
}

export interface ScaleUpComputeProvider<TState = unknown> extends ComputeProvider {
  resolveLabelsForRunners(messageLabels: string[]): Promise<RunnerLabelResolution<TState>>;
  getCurrentRunners(state: TState, input: CurrentRunnersInput): Promise<number>;
  createRunners(input: CreateScaleUpRunnersInput<TState>): Promise<CreateRunnerResult>;
}

export interface ScaleSetRunnerScope extends CurrentRunnersInput {
  scaleSetId: number;
}

export interface ScaleSetRunnerConfig extends ScaleSetRunnerScope {
  runnerNamePrefix: string;
  ssmTokenPath: string;
  ssmParameterStoreTags: { Key: string; Value: string }[];
}

export interface GetCurrentScaleSetRunnersInput extends ScaleSetRunnerScope {
  runnerNamePrefix: string;
  ssmTokenPath: string;
  /** Exact GitHub cleanup when safely reaping unpublished or stopped compute. */
  removeJitRunner: RemoveScaleSetRunner;
}

export interface ScaleSetJitConfigInput {
  runnerName: string;
}

export interface ScaleSetJitConfigResult {
  encodedJitConfig: string;
  runnerId: number;
  runnerName: string;
}

export type GenerateScaleSetJitConfig = (input: ScaleSetJitConfigInput) => Promise<ScaleSetJitConfigResult>;
export interface RemoveScaleSetRunnerInput {
  runnerId: number;
  runnerName: string;
  scaleSetId: number;
}

export type RemoveScaleSetRunner = (input: RemoveScaleSetRunnerInput) => Promise<void>;

export interface CreateScaleSetRunnersInput {
  runnerConfig: ScaleSetRunnerConfig;
  numberOfRunners: number;
  generateJitConfig: GenerateScaleSetJitConfig;
  /** Best-effort cleanup for a GitHub runner whose JIT config was not published. */
  removeRunner: RemoveScaleSetRunner;
}

export interface TerminateSurplusScaleSetRunnersInput extends ScaleSetRunnerScope {
  /** Prefix used to derive the immutable expected runner name from its compute ID. */
  runnerNamePrefix: string;
  /** Desired total capacity after reconciliation. */
  desiredRunners: number;
  /** Surplus observed by the orchestrator. Providers must not terminate more than this count. */
  excessRunners: number;
  /** Per-runner JIT configuration path used to claim idle compute before termination. */
  ssmTokenPath: string;
  /** Remove the exact GitHub runner before compute termination; non-idempotent failures must abort termination. */
  removeRunner: RemoveScaleSetRunner;
}

export interface TerminateScaleSetRunnerInput extends ScaleSetRunnerScope {
  runnerName: string;
}

export interface MarkScaleSetRunnerStartedInput extends ScaleSetRunnerScope {
  runnerName: string;
}

export interface ScaleSetComputeProvider extends ComputeProvider {
  /** Count this scale set's ready or still-provisioning runners. */
  getCurrentRunners(input: GetCurrentScaleSetRunnersInput): Promise<number>;
  /** Create compute and publish one GitHub-generated JIT config per runner. */
  createRunners(input: CreateScaleSetRunnersInput): Promise<CreateRunnerResult>;
  /** Remove up to the requested surplus without terminating running jobs. */
  terminateSurplusRunners(input: TerminateSurplusScaleSetRunnersInput): Promise<number>;
  /** Mark the exact compute named by a JobStarted message as fully bootstrapped. */
  markRunnerStarted(input: MarkScaleSetRunnerStartedInput): Promise<void>;
  /** Terminate the exact ephemeral compute named by a JobCompleted message. */
  terminateCompletedRunner(input: TerminateScaleSetRunnerInput): Promise<void>;
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
  runnerName?: string;
  scaleSetState?: ScaleSetRunnerState;
  bypassRemoval?: boolean;
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
}

export interface PoolComputeProvider<TRunner = unknown> extends ComputeProvider {
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
