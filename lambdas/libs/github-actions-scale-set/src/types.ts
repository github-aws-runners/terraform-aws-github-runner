export const DEFAULT_RUNNER_GROUP = 'default';

export const MESSAGE_TYPES = {
  jobAvailable: 'JobAvailable',
  jobAssigned: 'JobAssigned',
  jobStarted: 'JobStarted',
  jobCompleted: 'JobCompleted',
} as const;

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];

export interface JobMessageBase {
  messageType: MessageType;
  runnerRequestId: number;
  repositoryName: string;
  ownerName: string;
  jobId: string;
  jobWorkflowRef: string;
  jobDisplayName: string;
  workflowRunId: number;
  eventName: string;
  requestLabels: string[];
  queueTime: string;
  scaleSetAssignTime: string;
  runnerAssignTime: string;
  finishTime: string;
}

export interface JobAvailable extends JobMessageBase {
  messageType: typeof MESSAGE_TYPES.jobAvailable;
  acquireJobUrl: string;
}

export interface JobAssigned extends JobMessageBase {
  messageType: typeof MESSAGE_TYPES.jobAssigned;
}

export interface JobStarted extends JobMessageBase {
  messageType: typeof MESSAGE_TYPES.jobStarted;
  runnerId: number;
  runnerName: string;
}

export interface JobCompleted extends JobMessageBase {
  messageType: typeof MESSAGE_TYPES.jobCompleted;
  result: string;
  runnerId: number;
  runnerName: string;
}

export interface Label {
  type?: string;
  name: string;
}

export interface RunnerGroup {
  id: number;
  name: string;
  size: number;
  isDefaultGroup: boolean;
}

export interface RunnerSetting {
  disableUpdate?: boolean;
}

/**
 * Runner scale set representation used by the Actions service.
 *
 * The same shape is accepted for create and update operations, so server-owned
 * fields are optional. The client translates `runnerSetting` to the upstream
 * wire key `RunnerSetting` when it sends a request.
 */
export interface RunnerScaleSet {
  id?: number;
  name?: string;
  runnerGroupId?: number;
  runnerGroupName?: string;
  labels?: Label[];
  runnerSetting?: RunnerSetting;
  createdOn?: string;
  runnerJitConfigUrl?: string;
  statistics?: RunnerScaleSetStatistic | null;
}

export interface RunnerScaleSetJitRunnerSetting {
  name: string;
  workFolder?: string;
}

export interface RunnerReference {
  id: number;
  name: string;
  runnerScaleSetId: number;
}

export interface GitHubRunnerReference {
  id: number;
  name: string;
  status: 'online' | 'offline' | string;
  busy: boolean;
}

export interface ScaleSetRunnerState {
  runnerId: number;
  runnerName: string;
  scaleSetId: number;
  status: 'online' | 'offline' | 'unknown';
  busy: boolean | undefined;
}

export interface RunnerScaleSetJitRunnerConfig {
  runner: RunnerReference | null;
  encodedJITConfig: string;
}

export interface RunnerScaleSetStatistic {
  totalAvailableJobs: number;
  totalAcquiredJobs: number;
  totalAssignedJobs: number;
  totalRunningJobs: number;
  totalRegisteredRunners: number;
  totalBusyRunners: number;
  totalIdleRunners: number;
}

export interface RunnerScaleSetSession {
  sessionId: string;
  ownerName: string;
  runnerScaleSet?: RunnerScaleSet | null;
  messageQueueUrl: string;
  messageQueueAccessToken: string;
  statistics?: RunnerScaleSetStatistic | null;
}

export interface RunnerScaleSetMessage {
  messageId: number;
  statistics: RunnerScaleSetStatistic | null;
  jobAvailableMessages: JobAvailable[];
  jobAssignedMessages: JobAssigned[];
  jobStartedMessages: JobStarted[];
  jobCompletedMessages: JobCompleted[];
}

export interface SystemInfo {
  system?: string;
  version?: string;
  commitSha?: string;
  scaleSetId?: number;
  subsystem?: string;
}

export interface AccessToken {
  token: string;
  expiresAt?: string | Date;
}

export type AccessTokenProvider = () => Promise<string | AccessToken>;

export type ScaleSetFetch = typeof globalThis.fetch;

export interface ScaleSetRequestOptions {
  signal?: AbortSignal;
}

export interface ScaleSetRetryOptions {
  /** Number of retries after the initial request for retry-eligible operations. */
  maxRetries?: number;
  /** Initial exponential-backoff delay. */
  initialBackoffMs?: number;
  /** Upper bound for exponential backoff and Retry-After delays. */
  maxBackoffMs?: number;
  /** Timeout applied independently to each fetch attempt. */
  requestTimeoutMs?: number;
}

interface ScaleSetClientBaseOptions {
  gitHubConfigUrl: string;
  systemInfo?: SystemInfo;
  fetch?: ScaleSetFetch;
  forceGhes?: boolean;
  userAgent?: string;
  /** Intended for deterministic tests. Defaults to `new Date()`. */
  now?: () => Date;
  retry?: ScaleSetRetryOptions;
}

export type GitHubActionsScaleSetClientOptions = ScaleSetClientBaseOptions &
  (
    | {
        personalAccessToken: string;
        accessTokenProvider?: never;
      }
    | {
        personalAccessToken?: never;
        accessTokenProvider: AccessTokenProvider;
      }
  );
