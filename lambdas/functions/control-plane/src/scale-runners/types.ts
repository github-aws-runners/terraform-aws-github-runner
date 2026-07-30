export type LambdaRunnerSource = 'scale-up-lambda' | 'pool-lambda';
export type GitHubRunnerType = 'Org' | 'Repo';

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
}

export interface EphemeralRunnerConfig {
  runnerName: string;
  runnerGroupId: number;
  runnerLabels: string[];
}
