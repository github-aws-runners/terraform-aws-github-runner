import type { Octokit } from '@octokit/rest';

import type { CreateGitHubRunnerConfig, GitHubRunnerType } from '../scale-runners/types';

export type PoolRunnerProviderType = string;

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

export interface PoolRunnerProvider<TRunner = unknown> {
  type: PoolRunnerProviderType;
  listRunners(input: ListPoolRunnersInput): Promise<TRunner[]>;
  countAvailableRunners(
    runners: TRunner[],
    runnerStatus: Map<string, RunnerStatus>,
    includeBusyRunners: boolean,
  ): number;
  createRunners(input: CreatePoolRunnersInput): Promise<string[]>;
}

export interface PoolRunnerProviderStrategy {
  type: PoolRunnerProviderType;
  createFromEnv(): PoolRunnerProvider;
}
