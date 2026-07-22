import type { Octokit } from '@octokit/rest';
import type { RunnerProvider } from '@aws-github-runner/runner-provider';

import type { CreateGitHubRunnerConfig, GitHubRunnerType } from './types';

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

export interface ScaleUpRunnerProvider<TState = unknown> extends RunnerProvider {
  prepareGroup(messageLabels: string[]): Promise<PreparedScaleUpRunnerGroup<TState>>;
  getCurrentRunners(state: TState, input: CurrentRunnersInput): Promise<number>;
  createRunners(input: CreateScaleUpRunnersInput<TState>): Promise<string[]>;
}
