import {
  GitHubActionsScaleSetClient,
  isScaleSetHttpError,
  ScaleSetProtocolError,
  type AccessToken,
  type GitHubRunnerReference,
  type MessageSessionClient,
  type RunnerScaleSetMessage,
  type RunnerScaleSetStatistic,
  type ScaleSetRunnerState as GitHubScaleSetRunnerState,
} from '@aws-github-runner/github-actions-scale-set';
import type {
  ScaleSetComputeProvider,
  ScaleSetComputeProviderFactoryInput,
  ScaleSetReconcileResult,
  ScaleSetRunnerLifecycle,
  ScaleSetRunnerState,
} from '@aws-github-runner/compute-providers/scale-set';

import { ScaleSetConfigurationError, type ScaleSetReconcilerConfig, type ScaleSetServiceConfig } from './config';
import type { ScaleSetReconcilerStatusReporter } from './health';
import type { ScaleSetLogger } from './logger';

const MAX_JIT_CONFIGURATION_BYTES = 1024 * 1024;
const SCALE_SET_INVENTORY_TTL_MS = 60_000;

export interface ScaleSetComputeProviderFactory {
  create(type: string, input: ScaleSetComputeProviderFactoryInput): ScaleSetComputeProvider;
}

export type ScaleSetReconcilerClient = Pick<
  GitHubActionsScaleSetClient,
  | 'createMessageSessionClient'
  | 'generateJitRunnerConfig'
  | 'getGitHubRunner'
  | 'getRunnerScaleSetById'
  | 'getRunnerByName'
  | 'listGitHubRunners'
  | 'listRunners'
  | 'removeRunner'
>;

export interface ScaleSetReconcilerDependencies {
  createAccessTokenProvider(config: ScaleSetReconcilerConfig): Promise<() => Promise<AccessToken>>;
  createClient(config: ScaleSetReconcilerConfig, provider: () => Promise<AccessToken>): ScaleSetReconcilerClient;
  computeProviders: ScaleSetComputeProviderFactory;
  logger: ScaleSetLogger;
  sleep(delayMs: number, signal: AbortSignal): Promise<void>;
  random(): number;
  closeSignal(timeoutMs: number): AbortSignal;
  runnerInventory: ScaleSetRunnerInventoryCache;
}

export interface ScaleSetRunnerInventoryCache {
  get(key: string, loader: () => Promise<readonly GitHubRunnerReference[]>): Promise<readonly GitHubRunnerReference[]>;
}

export class TtlScaleSetRunnerInventoryCache implements ScaleSetRunnerInventoryCache {
  private readonly entries = new Map<string, { expiresAt: number; value: Promise<readonly GitHubRunnerReference[]> }>();

  constructor(
    private readonly ttlMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  async get(
    key: string,
    loader: () => Promise<readonly GitHubRunnerReference[]>,
  ): Promise<readonly GitHubRunnerReference[]> {
    const current = this.entries.get(key);
    if (current !== undefined && current.expiresAt > this.now()) return await current.value;
    const value = loader();
    this.entries.set(key, { expiresAt: this.now() + this.ttlMs, value });
    try {
      return await value;
    } catch (error) {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
      throw error;
    }
  }
}

interface LifecycleObservation {
  runnerId: number;
  runnerName: string;
  scaleSetId: number;
  lifecycle: ScaleSetRunnerLifecycle;
}

export class ScaleSetProviderReconciliationError extends Error {
  constructor(
    readonly result: ScaleSetReconcileResult,
    readonly retryable: boolean,
  ) {
    super(`scale-set compute provider returned ${result.status}`);
    this.name = 'ScaleSetProviderReconciliationError';
  }
}

export class ScaleSetReconciler {
  private readonly lifecycle = new Map<string, LifecycleObservation>();
  private readonly lifecycleLimit: number;
  private inventory?: { expiresAt: number; value: Promise<readonly GitHubScaleSetRunnerState[]> };

  constructor(
    private readonly config: ScaleSetReconcilerConfig,
    private readonly serviceConfig: Pick<
      ScaleSetServiceConfig,
      'sessionCloseTimeoutMs' | 'reconnectInitialBackoffMs' | 'reconnectMaxBackoffMs'
    >,
    private readonly dependencies: ScaleSetReconcilerDependencies,
  ) {
    this.lifecycleLimit = Math.min(20_000, Math.max(1000, config.maxRunners * 4));
  }

  async run(signal: AbortSignal, status: ScaleSetReconcilerStatusReporter): Promise<void> {
    let provider: ScaleSetComputeProvider;
    let client: ScaleSetReconcilerClient;
    try {
      provider = this.dependencies.computeProviders.create(this.config.computeProvider.type, {
        runnerConfigName: this.config.runnerConfigName,
        scaleSetId: this.config.scaleSetId,
        githubScope: this.config.githubConfigUrl,
        configuration: this.config.computeProvider.configuration,
      });
      const accessTokenProvider = await this.dependencies.createAccessTokenProvider(this.config);
      client = this.dependencies.createClient(this.config, accessTokenProvider);
    } catch (error) {
      status.markFailed(error);
      this.log('error', 'scale_set_reconciler_initialization_failed', { error });
      return;
    }

    let consecutiveFailures = 0;
    while (!signal.aborted) {
      let session: MessageSessionClient | undefined;
      let madeProgress = false;
      try {
        const configuredScaleSet = await client.getRunnerScaleSetById(this.config.scaleSetId, { signal });
        if (
          configuredScaleSet === null ||
          configuredScaleSet.id !== this.config.scaleSetId ||
          configuredScaleSet.name !== this.config.expectedScaleSetName ||
          (this.config.expectedRunnerGroupId !== undefined &&
            configuredScaleSet.runnerGroupId !== this.config.expectedRunnerGroupId)
        ) {
          throw new ScaleSetConfigurationError('configured GitHub runner scale set identity does not match');
        }
        session = await client.createMessageSessionClient(this.config.scaleSetId, this.config.sessionOwner, { signal });
        status.markSessionReady();
        this.log('info', 'scale_set_session_created');
        let latestStatistics = session.session.statistics ?? undefined;
        let lastMessageId = 0;
        if (latestStatistics !== undefined) {
          await this.reconcile(client, provider, latestStatistics, signal);
          madeProgress = true;
          consecutiveFailures = 0;
          status.markProgress();
        }

        while (!signal.aborted) {
          const message = await session.getMessage(lastMessageId, this.config.maxRunners, { signal });
          if (message === null) {
            if (latestStatistics === undefined) {
              throw new ScaleSetProtocolError('message session returned no message and no statistics snapshot');
            }
            await this.reconcile(client, provider, latestStatistics, signal);
          } else {
            if (message.statistics === null) {
              throw new ScaleSetProtocolError(`scale-set message ${message.messageId} contains no statistics`);
            }
            latestStatistics = message.statistics;
            lastMessageId = message.messageId;
            const requestIds = uniqueRequestIds(message);
            if (requestIds.length > 0) await session.acquireJobs(requestIds, { signal });
            this.observeLifecycle(message);
            await this.reconcile(client, provider, latestStatistics, signal);
            // Acknowledge only after the idempotent provider reconciliation has
            // succeeded. Failures intentionally leave the message for redelivery.
            await session.deleteMessage(message.messageId, { signal });
            this.pruneCompletedLifecycle(message);
          }
          madeProgress = true;
          consecutiveFailures = 0;
          status.markProgress();
        }
      } catch (error) {
        if (signal.aborted) break;
        if (isFatalReconcilerError(error)) {
          status.markFailed(error);
          this.log('error', 'scale_set_reconciler_failed', { error });
          return;
        }
        consecutiveFailures = madeProgress ? 1 : consecutiveFailures + 1;
        status.markReconnecting(error);
        this.log('warn', 'scale_set_reconciler_reconnecting', { consecutiveFailures, error });
      } finally {
        if (session !== undefined) await this.closeSession(session);
      }

      if (!signal.aborted) {
        await this.dependencies.sleep(
          calculateReconnectDelay(
            consecutiveFailures,
            this.serviceConfig.reconnectInitialBackoffMs,
            this.serviceConfig.reconnectMaxBackoffMs,
            this.dependencies.random,
          ),
          signal,
        );
      }
    }
    status.markStopping();
  }

  private async reconcile(
    client: ScaleSetReconcilerClient,
    provider: ScaleSetComputeProvider,
    statistics: RunnerScaleSetStatistic,
    signal: AbortSignal,
  ): Promise<void> {
    const desiredRunners = calculateDesiredRunners(
      statistics.totalAssignedJobs,
      this.config.minRunners,
      this.config.maxRunners,
    );
    const callbacks = {
      signal,
      generateJitConfiguration: async ({
        runnerName,
        signal: callbackSignal,
      }: {
        runnerName: string;
        signal?: AbortSignal;
      }) => {
        const jit = await client.generateJitRunnerConfig(
          { name: runnerName, workFolder: this.config.workFolder },
          this.config.scaleSetId,
          { signal: callbackSignal ?? signal },
        );
        if (
          jit.runner === null ||
          jit.runner.name !== runnerName ||
          jit.runner.runnerScaleSetId !== this.config.scaleSetId ||
          !Number.isSafeInteger(jit.runner.id) ||
          jit.runner.id <= 0
        ) {
          throw new ScaleSetProtocolError('GitHub returned a mismatched runner identity for JIT configuration');
        }
        if (
          typeof jit.encodedJITConfig !== 'string' ||
          jit.encodedJITConfig === '' ||
          Buffer.byteLength(jit.encodedJITConfig, 'utf8') > MAX_JIT_CONFIGURATION_BYTES
        ) {
          throw new ScaleSetProtocolError('GitHub returned an invalid JIT configuration');
        }
        return {
          encodedJitConfiguration: jit.encodedJITConfig,
          runnerId: jit.runner.id,
          runnerName: jit.runner.name,
          scaleSetId: jit.runner.runnerScaleSetId,
        };
      },
      removeRunner: async (expected: {
        runnerId: number;
        runnerName: string;
        scaleSetId: number;
        signal?: AbortSignal;
      }) => {
        const callbackSignal = expected.signal ?? signal;
        const runner = await client.getRunnerByName(expected.runnerName, { signal: callbackSignal });
        if (runner === null) return { status: 'retained_unknown' as const };
        if (
          runner.id !== expected.runnerId ||
          runner.name !== expected.runnerName ||
          runner.runnerScaleSetId !== expected.scaleSetId ||
          expected.scaleSetId !== this.config.scaleSetId
        ) {
          return { status: 'retained_unknown' as const };
        }
        const githubRunner = await client.getGitHubRunner(expected.runnerId, { signal: callbackSignal });
        if (githubRunner === null) return { status: 'retained_unknown' as const };
        if (githubRunner.id !== expected.runnerId || githubRunner.name !== expected.runnerName) {
          return { status: 'retained_unknown' as const };
        }
        if (
          typeof githubRunner.busy !== 'boolean' ||
          (githubRunner.status !== 'online' && githubRunner.status !== 'offline')
        ) {
          return { status: 'retained_unknown' as const };
        }
        if (githubRunner.busy) return { status: 'retained_busy' as const };
        try {
          await client.removeRunner(runner.id, { signal: callbackSignal });
        } catch (error) {
          if (isScaleSetHttpError(error) && error.status === 404) return { status: 'removed' as const };
          throw error;
        }
        return { status: 'removed' as const };
      },
    };
    let result = await provider.reconcile({
      desiredRunners,
      bootTimeoutMinutes: this.config.bootTimeoutMinutes,
      runnerInventoryComplete: false,
      runnerStates: this.lifecycleStates(),
      ...callbacks,
    });
    validateProviderResult(result, desiredRunners);
    if (result.needsRunnerInventory) {
      const inventory = await this.loadScaleSetInventory(client, signal);
      result = await provider.reconcile({
        desiredRunners,
        bootTimeoutMinutes: this.config.bootTimeoutMinutes,
        runnerInventoryComplete: true,
        runnerStates: this.mergeLifecycle(inventory),
        ...callbacks,
      });
      validateProviderResult(result, desiredRunners);
      if (result.needsRunnerInventory) {
        throw new ScaleSetProtocolError(
          'scale-set compute provider requested inventory after a complete inventory pass',
        );
      }
    }
    this.log('info', 'scale_set_reconciled', {
      desiredRunners,
      currentRunners: result.currentRunners,
      status: result.status,
      actions: result.actions,
      errorCount: result.errors.length,
    });
    if (result.status === 'retained') {
      this.log('warn', 'scale_set_capacity_retained', {
        desiredRunners,
        currentRunners: result.currentRunners,
        retainedBusy: result.actions.retainedBusy,
        retainedUnknown: result.actions.retainedUnknown,
      });
      return;
    }
    if (result.status !== 'converged') {
      throw new ScaleSetProviderReconciliationError(result, result.status === 'retryable_error');
    }
  }

  private observeLifecycle(message: RunnerScaleSetMessage): void {
    for (const runner of message.jobStartedMessages)
      this.rememberLifecycle(runner.runnerId, runner.runnerName, 'started');
    for (const runner of message.jobCompletedMessages) {
      this.rememberLifecycle(runner.runnerId, runner.runnerName, 'completed');
    }
  }

  private rememberLifecycle(runnerId: number, runnerName: string, lifecycle: ScaleSetRunnerLifecycle): void {
    if (!Number.isSafeInteger(runnerId) || runnerId <= 0 || runnerName === '') return;
    const current = this.lifecycle.get(runnerName);
    if (current !== undefined && current.runnerId !== runnerId) {
      this.lifecycle.delete(runnerName);
      return;
    }
    this.lifecycle.set(runnerName, { runnerId, runnerName, scaleSetId: this.config.scaleSetId, lifecycle });
    while (this.lifecycle.size > this.lifecycleLimit) {
      const oldest = this.lifecycle.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.lifecycle.delete(oldest);
    }
  }

  private pruneCompletedLifecycle(message: RunnerScaleSetMessage): void {
    for (const runner of message.jobCompletedMessages) {
      const observation = this.lifecycle.get(runner.runnerName);
      if (observation?.runnerId === runner.runnerId && observation.lifecycle === 'completed') {
        this.lifecycle.delete(runner.runnerName);
      }
    }
  }

  private mergeLifecycle(inventory: readonly GitHubScaleSetRunnerState[]): ScaleSetRunnerState[] {
    const result = inventory.map((runner): ScaleSetRunnerState => {
      const observation = this.lifecycle.get(runner.runnerName);
      const lifecycle =
        observation !== undefined &&
        observation.runnerId === runner.runnerId &&
        observation.scaleSetId === runner.scaleSetId
          ? observation.lifecycle
          : 'unknown';
      return { ...runner, lifecycle };
    });
    const identities = new Set(result.map((runner) => `${runner.runnerId}\u0000${runner.runnerName}`));
    for (const observation of this.lifecycle.values()) {
      if (identities.has(`${observation.runnerId}\u0000${observation.runnerName}`)) continue;
      result.push({ ...observation, status: 'unknown', busy: undefined });
    }
    return result;
  }

  private lifecycleStates(): ScaleSetRunnerState[] {
    return [...this.lifecycle.values()].map((observation) => ({
      ...observation,
      status: 'unknown',
      busy: undefined,
    }));
  }

  private inventoryCacheKey(): string {
    const app = this.config.githubApp;
    return [
      this.config.githubConfigUrl,
      app.appIdParameterName,
      app.installationIdParameterName,
      app.privateKeyParameterName,
    ].join('\u0000');
  }

  private async loadScaleSetInventory(
    client: ScaleSetReconcilerClient,
    signal: AbortSignal,
  ): Promise<readonly GitHubScaleSetRunnerState[]> {
    if (this.inventory !== undefined && this.inventory.expiresAt > Date.now()) return await this.inventory.value;
    const value = Promise.all([
      client.listRunners({ signal }),
      this.dependencies.runnerInventory.get(
        this.inventoryCacheKey(),
        async () => await client.listGitHubRunners({ signal }),
      ),
    ]).then(([actionsRunners, githubRunners]) =>
      joinRunnerInventory(actionsRunners, githubRunners, this.config.scaleSetId),
    );
    this.inventory = { expiresAt: Date.now() + SCALE_SET_INVENTORY_TTL_MS, value };
    try {
      return await value;
    } catch (error) {
      if (this.inventory?.value === value) this.inventory = undefined;
      throw error;
    }
  }

  private async closeSession(session: Pick<MessageSessionClient, 'close'>): Promise<void> {
    try {
      await session.close({ signal: this.dependencies.closeSignal(this.serviceConfig.sessionCloseTimeoutMs) });
    } catch (error) {
      this.log('warn', 'scale_set_session_close_failed', { error });
    }
  }

  private log(level: 'info' | 'warn' | 'error', event: string, attributes: Record<string, unknown> = {}): void {
    this.dependencies.logger[level](event, {
      groupRunnerConfig: this.config.runnerConfigName,
      scaleSetId: this.config.scaleSetId,
      ...attributes,
    });
  }
}

export function calculateDesiredRunners(totalAssignedJobs: number, minRunners: number, maxRunners: number): number {
  if (!Number.isSafeInteger(totalAssignedJobs) || totalAssignedJobs < 0) {
    throw new ScaleSetProtocolError('statistics.totalAssignedJobs must be a non-negative integer');
  }
  // maxRunners bounds newly requested idle capacity, but an operator reducing
  // it must never make already-assigned work a scale-down target.
  return Math.max(totalAssignedJobs, Math.min(maxRunners, minRunners + totalAssignedJobs));
}

export function calculateReconnectDelay(
  attempt: number,
  initialBackoffMs: number,
  maxBackoffMs: number,
  random: () => number = Math.random,
): number {
  if (!Number.isSafeInteger(attempt) || attempt <= 0) throw new Error('attempt must be a positive integer');
  const ceiling = Math.min(maxBackoffMs, initialBackoffMs * 2 ** Math.min(attempt - 1, 30));
  const value = Math.max(0, Math.min(1, random()));
  return Math.floor(ceiling / 2 + (ceiling / 2) * value);
}

export async function abortableSleep(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted || delayMs <= 0) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timeout = setTimeout(done, delayMs);
    signal.addEventListener('abort', done, { once: true });
  });
}

function uniqueRequestIds(message: RunnerScaleSetMessage): number[] {
  return [...new Set(message.jobAvailableMessages.map(({ runnerRequestId }) => runnerRequestId))];
}

export function validateProviderResult(result: ScaleSetReconcileResult, desiredRunners: number): void {
  const value = result as unknown;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ScaleSetProtocolError('scale-set compute provider returned an invalid reconciliation result');
  }
  const record = value as Record<string, unknown>;
  const statuses = new Set(['converged', 'retained', 'retryable_error', 'non_retryable_error']);
  if (!statuses.has(record.status as string)) {
    throw new ScaleSetProtocolError('scale-set compute provider returned an invalid status');
  }
  if (record.desiredRunners !== desiredRunners || !boundedCount(record.currentRunners)) {
    throw new ScaleSetProtocolError('scale-set compute provider returned invalid capacity counts');
  }
  if (typeof record.needsRunnerInventory !== 'boolean') {
    throw new ScaleSetProtocolError('scale-set compute provider returned an invalid inventory signal');
  }
  const actions = record.actions;
  if (typeof actions !== 'object' || actions === null || Array.isArray(actions)) {
    throw new ScaleSetProtocolError('scale-set compute provider returned invalid actions');
  }
  for (const key of ['launched', 'terminated', 'retainedBusy', 'retainedUnknown']) {
    if (!boundedCount((actions as Record<string, unknown>)[key])) {
      throw new ScaleSetProtocolError('scale-set compute provider returned invalid action counts');
    }
  }
  if (!Array.isArray(record.errors) || record.errors.length > 1000) {
    throw new ScaleSetProtocolError('scale-set compute provider returned invalid errors');
  }
  const operations = new Set([
    'validate',
    'reconcile',
    'list',
    'launch',
    'generate_jit_configuration',
    'publish_jit_configuration',
    'remove_runner',
    'terminate',
  ]);
  for (const error of record.errors) {
    if (typeof error !== 'object' || error === null || Array.isArray(error)) {
      throw new ScaleSetProtocolError('scale-set compute provider returned invalid error metadata');
    }
    const metadata = error as Record<string, unknown>;
    if (
      !operations.has(metadata.operation as string) ||
      typeof metadata.retryable !== 'boolean' ||
      typeof metadata.code !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(metadata.code) ||
      !optionalBoundedMetadata(metadata.runnerName) ||
      !optionalBoundedMetadata(metadata.resourceId)
    ) {
      throw new ScaleSetProtocolError('scale-set compute provider returned invalid error metadata');
    }
  }
}

function boundedCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 2_147_483_647;
}

function optionalBoundedMetadata(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.length <= 256 && !hasAsciiControlCharacter(value));
}

function hasAsciiControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function isFatalReconcilerError(error: unknown): boolean {
  if (error instanceof ScaleSetConfigurationError || error instanceof ScaleSetProtocolError) return true;
  if (error instanceof ScaleSetProviderReconciliationError) return !error.retryable;
  if (!isScaleSetHttpError(error)) return false;
  return error.status >= 400 && error.status < 500 && ![408, 409, 425, 429].includes(error.status);
}

function joinRunnerInventory(
  actionsRunners: readonly { id: number; name: string; runnerScaleSetId: number }[],
  githubRunners: readonly GitHubRunnerReference[],
  scaleSetId: number,
): GitHubScaleSetRunnerState[] {
  const githubById = new Map<number, GitHubRunnerReference>();
  const duplicateIds = new Set<number>();
  for (const runner of githubRunners) {
    if (githubById.has(runner.id)) duplicateIds.add(runner.id);
    else githubById.set(runner.id, runner);
  }
  return actionsRunners
    .filter((runner) => runner.runnerScaleSetId === scaleSetId)
    .map((runner) => {
      const githubRunner = duplicateIds.has(runner.id) ? undefined : githubById.get(runner.id);
      const exact = githubRunner?.name === runner.name;
      return {
        runnerId: runner.id,
        runnerName: runner.name,
        scaleSetId: runner.runnerScaleSetId,
        status:
          exact && (githubRunner.status === 'online' || githubRunner.status === 'offline')
            ? githubRunner.status
            : 'unknown',
        busy: exact && typeof githubRunner.busy === 'boolean' ? githubRunner.busy : undefined,
      };
    });
}
