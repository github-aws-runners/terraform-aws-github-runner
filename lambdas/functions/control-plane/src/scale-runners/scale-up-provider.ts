import type { Octokit } from '@octokit/rest';

import type { ActionRequestMessageSQS, CreateGitHubRunnerConfig, GitHubRunnerType } from './types';

export interface CurrentRunnersInput {
  runnerType: GitHubRunnerType;
  runnerOwner: string;
}

export interface CreateScaleUpRunnersInput {
  githubRunnerConfig: CreateGitHubRunnerConfig;
  numberOfRunners: number;
  githubInstallationClient: Octokit;
  messages: ActionRequestMessageSQS[];
  state: unknown;
}

export interface PreparedScaleUpRunnerGroup {
  runnerLabels: string[];
  state: unknown;
}

export type ScaleUpRunnerProviderType = string;

export interface ScaleUpRunnerProvider {
  type: ScaleUpRunnerProviderType;
  prepareGroup(messageLabels: string[]): Promise<PreparedScaleUpRunnerGroup>;
  getCurrentRunners(state: unknown, input: CurrentRunnersInput): Promise<number>;
  createRunners(input: CreateScaleUpRunnersInput): Promise<string[]>;
}

export interface CreateScaleUpRunnerProviderInput {
  environment: string;
  scaleErrors: string[];
}

export interface ScaleUpRunnerProviderStrategy {
  type: ScaleUpRunnerProviderType;
  createFromEnv(input: CreateScaleUpRunnerProviderInput): ScaleUpRunnerProvider;
}
