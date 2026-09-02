export type {
  CreateGitHubRunnerConfig,
  CreateRunnerResult,
  CreateScaleUpRunnersInput,
  CurrentRunnersInput,
  LambdaRunnerSource,
  RunnerLabelResolution,
  RunnerInfo,
  RunnerType,
  ScaleDownComputeProvider,
  ScaleUpComputeProvider,
} from '@aws-github-runner/compute-providers/core';

export interface RunnerGroup {
  name: string;
  id: number;
}

export interface ActionRequestMessage {
  id: number;
  eventType: 'check_run' | 'workflow_job';
  repositoryName: string;
  repositoryOwner: string;
  installationId: number;
  repoOwnerType: string;
  retryCounter?: number;
  labels?: string[];
}

export interface ActionRequestMessageSQS extends ActionRequestMessage {
  messageId: string;
}

export interface ActionRequestMessageRetry extends ActionRequestMessage {
  retryCounter: number;
}

export interface EphemeralRunnerConfig {
  runnerName: string;
  runnerGroupId: number;
  runnerLabels: string[];
}
