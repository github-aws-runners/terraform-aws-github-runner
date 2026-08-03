import type { Octokit } from '@octokit/rest';
import type { RunnerProvider } from '@aws-github-runner/runner-provider';

import type { CreateGitHubRunnerConfig, GitHubRunnerType } from '../scale-runners/types';

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
  // Optional extra capacity to count toward the pool target (e.g. EC2 warm/stopped instances that can
  // be restarted quickly). Returns 0 when not implemented.
  additionalPoolCapacity?(input: ListPoolRunnersInput): Promise<number>;
}
