import type { Octokit } from '@octokit/rest';

import type { RunnerProvider, RunnerProviderStrategy, RunnerProviderType } from '../runner-provider';
import type { ActionRequestMessageSQS, CreateGitHubRunnerConfig, GitHubRunnerType } from './types';

export interface CurrentRunnersInput {
  runnerType: GitHubRunnerType;
  runnerOwner: string;
}

export interface CreateScaleUpRunnersInput<TState = unknown> {
  githubRunnerConfig: CreateGitHubRunnerConfig;
  numberOfRunners: number;
  githubInstallationClient: Octokit;
  messages: ActionRequestMessageSQS[];
  state: TState;
}

export interface PreparedScaleUpRunnerGroup<TState = unknown> {
  runnerLabels: string[];
  state: TState;
}

export type ScaleUpRunnerProviderType = RunnerProviderType;

export interface ScaleUpRunnerProvider<TState = unknown> extends RunnerProvider {
  prepareGroup(messageLabels: string[]): Promise<PreparedScaleUpRunnerGroup<TState>>;
  getCurrentRunners(state: TState, input: CurrentRunnersInput): Promise<number>;
  createRunners(input: CreateScaleUpRunnersInput<TState>): Promise<string[]>;
}

export interface CreateScaleUpRunnerProviderInput {
  environment: string;
  scaleErrors: string[];
}

export type ScaleUpRunnerProviderStrategy<TState = unknown> = RunnerProviderStrategy<
  ScaleUpRunnerProvider<TState>,
  [input: CreateScaleUpRunnerProviderInput]
>;
