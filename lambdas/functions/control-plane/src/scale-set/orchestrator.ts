import type {
  GitHubActionsScaleSetClient,
  MessageSessionClient,
  RunnerScaleSetMessage,
  RunnerScaleSetStatistic,
} from '@aws-github-runner/github-actions-scale-set';
import { isScaleSetHttpError, ScaleSetProtocolError } from '@aws-github-runner/github-actions-scale-set';
import type {
  CreateRunnerResult,
  ScaleSetComputeProvider,
  ScaleSetRunnerConfig,
} from '@aws-github-runner/compute-providers/core';

const MAX_SCALE_SET_CAPACITY = 2_147_483_647;

export type ScaleSetApiClient = Pick<
  GitHubActionsScaleSetClient,
  'generateJitRunnerConfig' | 'getRunnerByName' | 'removeRunner'
>;
export type ScaleSetMessageSession = Pick<
  MessageSessionClient,
  'session' | 'getMessage' | 'deleteMessage' | 'acquireJobs'
>;
export type ScaleSetProvider = Omit<ScaleSetComputeProvider, 'type'>;

export interface ScaleSetOrchestratorConfig {
  scaleSetId: number;
  minRunners: number;
  maxRunners: number;
  runnerConfig: Omit<ScaleSetRunnerConfig, 'scaleSetId'>;
  workFolder?: string;
}

export interface ScaleSetPollState {
  initialized: boolean;
  lastMessageId: number;
  latestStatistics?: RunnerScaleSetStatistic;
}

export interface ScaleSetReconciliationResult {
  currentRunners: number;
  createdRunners: number;
  terminatedRunners: number;
  targetRunners: number;
}

export interface ScaleSetPollResult {
  state: ScaleSetPollState;
  message?: RunnerScaleSetMessage;
  acquiredRequestIds: number[];
  startedRunnerNames: string[];
  completedRunnerNames: string[];
  reconciliations: ScaleSetReconciliationResult[];
}

export interface PollScaleSetOnceOptions {
  client: ScaleSetApiClient;
  session: ScaleSetMessageSession;
  provider: ScaleSetProvider;
  config: ScaleSetOrchestratorConfig;
  state?: ScaleSetPollState;
  signal?: AbortSignal;
}

export interface RunScaleSetPollLoopOptions extends Omit<PollScaleSetOnceOptions, 'state'> {
  state?: ScaleSetPollState;
  onPoll?: (result: ScaleSetPollResult) => void | Promise<void>;
}

export class ScaleSetReconciliationError extends Error {
  constructor(
    readonly requestedRunners: number,
    readonly result: CreateRunnerResult,
  ) {
    super(
      `Scale-set provider created ${result.instances.length} of ${requestedRunners} requested runners ` +
        `(${result.retryableErrorCount} retryable, ${result.nonRetryableErrorCount} non-retryable failures)`,
    );
    this.name = 'ScaleSetReconciliationError';
  }
}

export function createScaleSetPollState(session: ScaleSetMessageSession): ScaleSetPollState {
  return {
    initialized: false,
    lastMessageId: 0,
    latestStatistics: session.session.statistics ?? undefined,
  };
}

export function calculateScaleSetTarget(
  statistics: Pick<RunnerScaleSetStatistic, 'totalAssignedJobs'>,
  minRunners: number,
  maxRunners: number,
): number {
  validateCapacityConfig(minRunners, maxRunners);
  validateNonNegativeInteger(statistics.totalAssignedJobs, 'statistics.totalAssignedJobs');

  return Math.min(maxRunners, minRunners + statistics.totalAssignedJobs);
}

export async function pollScaleSetOnce(options: PollScaleSetOnceOptions): Promise<ScaleSetPollResult> {
  const { client, session, provider, config, signal } = options;
  validateCapacityConfig(config.minRunners, config.maxRunners);
  validatePositiveInteger(config.scaleSetId, 'scaleSetId');

  const state = options.state ?? createScaleSetPollState(session);
  let nextState: ScaleSetPollState = { ...state };
  const reconciliations: ScaleSetReconciliationResult[] = [];
  let reconciledBeforePoll = false;

  // A newly-created message session contains a current statistics snapshot. Reconcile it
  // immediately so a Lambda invocation does not wait through a long poll before scaling.
  if (!nextState.initialized && nextState.latestStatistics) {
    reconciliations.push(await reconcileScaleSetCapacity(client, provider, config, nextState.latestStatistics, signal));
    nextState = { ...nextState, initialized: true };
    reconciledBeforePoll = true;
  }

  const message = await session.getMessage(nextState.lastMessageId, config.maxRunners, { signal });

  if (!message) {
    if (!nextState.latestStatistics) {
      throw new Error('Scale-set session returned no message and no statistics snapshot');
    }

    // Re-run the last desired-state reconciliation after an empty long poll. This heals
    // externally-terminated runners without relying on another message being delivered.
    if (!reconciledBeforePoll) {
      reconciliations.push(
        await reconcileScaleSetCapacity(client, provider, config, nextState.latestStatistics, signal),
      );
    }

    return {
      state: { ...nextState, initialized: true },
      acquiredRequestIds: [],
      startedRunnerNames: [],
      completedRunnerNames: [],
      reconciliations,
    };
  }

  const statistics = message.statistics ?? nextState.latestStatistics;
  if (!statistics) {
    throw new Error(`Scale-set message ${message.messageId} does not contain statistics`);
  }

  const startedRunnerNames = (message.jobStartedMessages ?? []).map(({ runnerName }) => runnerName);
  await Promise.all(
    startedRunnerNames.map(async (runnerName) => {
      await provider.markRunnerStarted({
        runnerName,
        runnerOwner: config.runnerConfig.runnerOwner,
        runnerType: config.runnerConfig.runnerType,
        scaleSetId: config.scaleSetId,
      });
    }),
  );

  const completedRunnerNames = (message.jobCompletedMessages ?? []).map(({ runnerName }) => runnerName);
  await Promise.all(
    completedRunnerNames.map(async (runnerName) => {
      await provider.terminateCompletedRunner({
        runnerName,
        runnerOwner: config.runnerConfig.runnerOwner,
        runnerType: config.runnerConfig.runnerType,
        scaleSetId: config.scaleSetId,
      });
    }),
  );

  reconciliations.push(await reconcileScaleSetCapacity(client, provider, config, statistics, signal));

  const availableRequestIds = uniqueRequestIds(message);
  const acquiredRequestIds =
    availableRequestIds.length === 0 ? [] : await session.acquireJobs(availableRequestIds, { signal });

  // Acknowledgement is deliberately last. Provider failures leave the message available for
  // redelivery; provider counting and exact-name termination make that retry idempotent.
  await session.deleteMessage(message.messageId, { signal });

  nextState = {
    initialized: true,
    lastMessageId: message.messageId,
    latestStatistics: statistics,
  };

  return {
    state: nextState,
    message,
    acquiredRequestIds,
    startedRunnerNames,
    completedRunnerNames,
    reconciliations,
  };
}

export async function runScaleSetPollLoop(options: RunScaleSetPollLoopOptions): Promise<ScaleSetPollState> {
  let state = options.state ?? createScaleSetPollState(options.session);

  while (!options.signal?.aborted) {
    try {
      const result = await pollScaleSetOnce({ ...options, state });
      state = result.state;
      await options.onPoll?.(result);
    } catch (error) {
      if (options.signal?.aborted && isAbortError(error)) {
        return state;
      }
      throw error;
    }
  }

  return state;
}

async function reconcileScaleSetCapacity(
  client: ScaleSetApiClient,
  provider: ScaleSetProvider,
  config: ScaleSetOrchestratorConfig,
  statistics: RunnerScaleSetStatistic,
  signal?: AbortSignal,
): Promise<ScaleSetReconciliationResult> {
  const targetRunners = calculateScaleSetTarget(statistics, config.minRunners, config.maxRunners);
  const currentRunners = await provider.getCurrentRunners({
    runnerOwner: config.runnerConfig.runnerOwner,
    runnerType: config.runnerConfig.runnerType,
    scaleSetId: config.scaleSetId,
    runnerNamePrefix: config.runnerConfig.runnerNamePrefix,
    ssmTokenPath: config.runnerConfig.ssmTokenPath,
    removeJitRunner: async (runner) => await removeExactRunnerIfPresent(client, runner, signal),
  });
  validateNonNegativeInteger(currentRunners, 'provider current runner count');

  const excessRunners = Math.max(0, currentRunners - targetRunners);
  if (excessRunners > 0) {
    const terminatedRunners = await provider.terminateSurplusRunners({
      runnerOwner: config.runnerConfig.runnerOwner,
      runnerType: config.runnerConfig.runnerType,
      scaleSetId: config.scaleSetId,
      runnerNamePrefix: config.runnerConfig.runnerNamePrefix,
      desiredRunners: targetRunners,
      excessRunners,
      ssmTokenPath: config.runnerConfig.ssmTokenPath,
      removeRunner: async (runner) => await removeExactRunnerIfPresent(client, runner, signal),
    });
    validateNonNegativeInteger(terminatedRunners, 'provider terminated runner count');
    if (terminatedRunners > excessRunners) {
      throw new Error(`provider terminated ${terminatedRunners} runners for a surplus of only ${excessRunners}`);
    }
    return { currentRunners, createdRunners: 0, terminatedRunners, targetRunners };
  }

  const requestedRunners = Math.max(0, targetRunners - currentRunners);
  if (requestedRunners === 0) {
    return { currentRunners, createdRunners: 0, terminatedRunners: 0, targetRunners };
  }

  const result = await provider.createRunners({
    runnerConfig: {
      ...config.runnerConfig,
      scaleSetId: config.scaleSetId,
    },
    numberOfRunners: requestedRunners,
    generateJitConfig: async ({ runnerName }) => {
      let jitConfig: Awaited<ReturnType<ScaleSetApiClient['generateJitRunnerConfig']>>;
      try {
        jitConfig = await client.generateJitRunnerConfig(
          {
            name: runnerName,
            workFolder: config.workFolder ?? '_work',
          },
          config.scaleSetId,
          { signal },
        );
      } catch (error) {
        await bestEffortRemoveRunnerByName(client, runnerName, config.scaleSetId, signal);
        throw error;
      }

      if (!jitConfig.runner) {
        await bestEffortRemoveRunnerByName(client, runnerName, config.scaleSetId, signal);
        throw new ScaleSetProtocolError(`GitHub did not return a runner for JIT configuration '${runnerName}'`);
      }

      return {
        encodedJitConfig: jitConfig.encodedJITConfig,
        runnerId: jitConfig.runner.id,
        runnerName: jitConfig.runner.name,
      };
    },
    removeRunner: async (runner) => await removeExactRunnerIfPresent(client, runner, signal),
  });

  if (
    result.instances.length !== requestedRunners ||
    result.retryableErrorCount !== 0 ||
    result.nonRetryableErrorCount !== 0
  ) {
    throw new ScaleSetReconciliationError(requestedRunners, result);
  }

  return {
    currentRunners,
    createdRunners: result.instances.length,
    terminatedRunners: 0,
    targetRunners,
  };
}

async function removeRunnerIfPresent(client: ScaleSetApiClient, runnerId: number, signal?: AbortSignal): Promise<void> {
  try {
    await client.removeRunner(runnerId, { signal });
  } catch (error) {
    if (isScaleSetHttpError(error) && error.status === 404) return;
    throw error;
  }
}

async function removeExactRunnerIfPresent(
  client: ScaleSetApiClient,
  expected: { runnerId: number; runnerName: string; scaleSetId: number },
  signal?: AbortSignal,
): Promise<void> {
  const runner = await client.getRunnerByName(expected.runnerName, { signal });
  if (!runner) return;
  if (
    runner.id !== expected.runnerId ||
    runner.name !== expected.runnerName ||
    runner.runnerScaleSetId !== expected.scaleSetId
  ) {
    throw new ScaleSetProtocolError(
      `refusing to remove runner ${expected.runnerId}: expected ${JSON.stringify(expected.runnerName)} in ` +
        `scale set ${expected.scaleSetId}, got runner ${runner.id} named ${JSON.stringify(runner.name)} in scale set ` +
        `${runner.runnerScaleSetId}`,
    );
  }
  await removeRunnerIfPresent(client, runner.id, signal);
}

async function bestEffortRemoveRunnerByName(
  client: ScaleSetApiClient,
  runnerName: string,
  scaleSetId: number,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const runner = await client.getRunnerByName(runnerName, { signal });
    if (!runner || runner.runnerScaleSetId !== scaleSetId) return;
    await removeRunnerIfPresent(client, runner.id, signal);
  } catch (cleanupError) {
    // Preserve the generation failure. A later provisioning reap can retry cleanup
    // from the exact runner ID tagged on compute when GitHub returned one.
    void cleanupError;
  }
}

function uniqueRequestIds(message: RunnerScaleSetMessage): number[] {
  return [...new Set((message.jobAvailableMessages ?? []).map(({ runnerRequestId }) => runnerRequestId))];
}

function validateCapacityConfig(minRunners: number, maxRunners: number): void {
  validateNonNegativeInteger(minRunners, 'minRunners');
  validateNonNegativeInteger(maxRunners, 'maxRunners');
  if (minRunners > maxRunners) {
    throw new Error('minRunners cannot be greater than maxRunners');
  }
  if (maxRunners > MAX_SCALE_SET_CAPACITY) {
    throw new Error(`maxRunners cannot be greater than ${MAX_SCALE_SET_CAPACITY}`);
  }
}

function validatePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function validateNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
