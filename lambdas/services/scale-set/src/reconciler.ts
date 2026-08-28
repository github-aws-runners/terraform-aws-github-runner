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
  ScaleSetReconcileRequest,
  ScaleSetReconcileResult,
  ScaleSetRunnerLifecycle,
  ScaleSetRunnerState,
} from '@aws-github-runner/compute-providers/scale-set';

import { ScaleSetConfigurationError, type ScaleSetReconcilerConfig, type ScaleSetServiceConfig } from './config';
import type { ParameterStore } from './credentials';
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
  | 'getRunnerGroupByName'
  | 'getRunnerScaleSet'
  | 'getRunnerScaleSetById'
  | 'getRunnerByName'
  | 'listGitHubRunners'
  | 'listRunners'
  | 'removeRunner'
  | 'createRunnerScaleSet'
  | 'setSystemInfo'
  | 'systemInfo'
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
  parameterStore: ParameterStore;
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
    readonly result?: ScaleSetReconcileResult,
    options?: ErrorOptions,
  ) {
    super(
      result === undefined
        ? 'scale-set compute provider reconciliation failed'
        : `scale-set compute provider returned ${result.status}`,
      options,
    );
    this.name = 'ScaleSetProviderReconciliationError';
  }
}

export class ScaleSetReconciler {
  private readonly lifecycle = new Map<string, LifecycleObservation>();
  private readonly lifecycleLimit: number;
  private inventory?: { expiresAt: number; value: Promise<readonly GitHubScaleSetRunnerState[]> };
  private resolvedScaleSetId?: number;
  private resolvedRunnerGroupId?: number;

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
      const accessTokenProvider = await this.dependencies.createAccessTokenProvider(this.config);
      client = this.dependencies.createClient(this.config, accessTokenProvider);
      const resolved = await this.resolveScaleSet(client, signal, true);
      this.resolvedScaleSetId = resolved.scaleSetId;
      this.resolvedRunnerGroupId = resolved.runnerGroupId;
      client.setSystemInfo({ ...client.systemInfo, scaleSetId: resolved.scaleSetId });
      provider = this.dependencies.computeProviders.create(this.config.computeProvider.type, {
        runnerConfigName: this.config.runnerConfigName,
        scaleSetId: resolved.scaleSetId,
        githubScope: this.config.githubConfigUrl,
        configuration: this.config.computeProvider.configuration,
      });
      this.log('info', 'scale_set_compute_provider_created', {
        computeProviderType: this.config.computeProvider.type,
      });
    } catch (error) {
      status.markFailed(error);
      this.log('error', 'scale_set_reconciler_initialization_failed', {
        computeProviderType: this.config.computeProvider.type,
        ...httpErrorLogAttributes(error),
        error,
      });
      return;
    }

    let consecutiveFailures = 0;
    while (!signal.aborted) {
      let session: MessageSessionClient | undefined;
      let madeProgress = false;
      try {
        const configuredScaleSet = await client.getRunnerScaleSetById(this.scaleSetId, { signal });
        if (
          configuredScaleSet === null ||
          configuredScaleSet.id !== this.scaleSetId ||
          configuredScaleSet.name !== this.config.scaleSetName ||
          (this.resolvedRunnerGroupId !== undefined && configuredScaleSet.runnerGroupId !== this.resolvedRunnerGroupId)
        ) {
          throw new ScaleSetConfigurationError('configured GitHub runner scale set identity does not match');
        }
        session = await client.createMessageSessionClient(this.scaleSetId, this.config.sessionOwner, { signal });
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
            await session.deleteMessage(message.messageId, { signal });
            const requestIds = uniqueRequestIds(message);
            if (requestIds.length > 0) await session.acquireJobs(requestIds, { signal });
            this.observeLifecycle(message);
            await this.reconcile(client, provider, latestStatistics, signal);
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
          this.log('error', 'scale_set_reconciler_failed', {
            ...httpErrorLogAttributes(error),
            error,
          });
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

  /** Run one independent recovery pass without opening a message session or creating a scale set. */
  async recover(signal: AbortSignal): Promise<void> {
    let provider: ScaleSetComputeProvider;
    let client: ScaleSetReconcilerClient;
    try {
      const accessTokenProvider = await this.dependencies.createAccessTokenProvider(this.config);
      client = this.dependencies.createClient(this.config, accessTokenProvider);
      const resolved = await this.resolveScaleSet(client, signal, false);
      this.resolvedScaleSetId = resolved.scaleSetId;
      this.resolvedRunnerGroupId = resolved.runnerGroupId;
      client.setSystemInfo({ ...client.systemInfo, scaleSetId: resolved.scaleSetId });
      provider = this.dependencies.computeProviders.create(this.config.computeProvider.type, {
        runnerConfigName: this.config.runnerConfigName,
        scaleSetId: resolved.scaleSetId,
        githubScope: this.config.githubConfigUrl,
        configuration: this.config.computeProvider.configuration,
      });
    } catch (error) {
      if (signal.aborted) return;
      this.log('warn', 'scale_set_recovery_initialization_failed', {
        computeProviderType: this.config.computeProvider.type,
        ...httpErrorLogAttributes(error),
        error,
      });
      return;
    }

    try {
      this.log('info', 'scale_set_runner_inventory_loading', {
        githubConfigUrl: this.config.githubConfigUrl,
        githubApiMode: this.config.forceGhes ? 'ghes' : 'hosted',
        inventorySources: ['actions_service', 'github_rest'],
      });
      const inventory = await this.loadScaleSetInventory(client, signal);
      this.log('info', 'scale_set_runner_inventory_loaded', {
        githubConfigUrl: this.config.githubConfigUrl,
        runnerCount: inventory.length,
      });
      const result = await this.reconcileProvider(provider, {
        desiredRunners: 0,
        recoveryOnly: true,
        bootTimeoutMinutes: this.config.bootTimeoutMinutes,
        runnerInventoryComplete: true,
        runnerStates: this.mergeLifecycle(inventory),
        ...this.createReconcileCallbacks(client, signal),
      });
      validateProviderResult(result, 0);
      throwIfProviderError(result);
      this.log('info', 'scale_set_recovery_reconciled', {
        computeProviderType: this.config.computeProvider.type,
        currentRunners: result.currentRunners,
        status: result.status,
        actions: result.actions,
        errorCount: result.errors.length,
      });
    } catch (error) {
      if (signal.aborted) return;
      this.log('warn', 'scale_set_recovery_failed', {
        failureStage: 'github_runner_inventory_or_ec2_recovery',
        githubConfigUrl: this.config.githubConfigUrl,
        githubApiMode: this.config.forceGhes ? 'ghes' : 'hosted',
        diagnosis:
          isScaleSetHttpError(error) && error.status === 404
            ? 'github_endpoint_not_found_or_app_not_authorized'
            : undefined,
        computeProviderType: this.config.computeProvider.type,
        ...httpErrorLogAttributes(error),
        error,
      });
    }
  }

  private async resolveScaleSet(
    client: ScaleSetReconcilerClient,
    signal: AbortSignal,
    registerMissing: boolean,
  ): Promise<{ scaleSetId: number; runnerGroupId?: number }> {
    let runnerGroupId = this.config.expectedRunnerGroupId;
    if (this.config.runnerGroupName !== undefined) {
      const cachedRunnerGroupId = await this.loadCachedRunnerGroupId();
      const runnerGroup =
        cachedRunnerGroupId === undefined
          ? await client.getRunnerGroupByName(this.config.runnerGroupName, { signal })
          : { id: cachedRunnerGroupId };
      if (runnerGroupId !== undefined && runnerGroupId !== runnerGroup.id) {
        throw new ScaleSetConfigurationError(
          `runner group ${JSON.stringify(this.config.runnerGroupName)} resolved to ID ${runnerGroup.id}, expected ${runnerGroupId}`,
        );
      }
      runnerGroupId = runnerGroup.id;
      if (cachedRunnerGroupId === undefined && this.config.runnerGroupIdParameterName !== undefined) {
        await this.dependencies.parameterStore.put?.(this.config.runnerGroupIdParameterName, String(runnerGroupId));
      }
      this.log('info', 'scale_set_runner_group_resolved', {
        runnerConfigName: this.config.runnerConfigName,
        runnerGroupName: this.config.runnerGroupName,
        runnerGroupId,
      });
    }

    if (this.config.scaleSetId === undefined && runnerGroupId === undefined) {
      throw new ScaleSetConfigurationError('runner group ID was not resolved');
    }
    let configuredScaleSet =
      this.config.scaleSetId === undefined
        ? await client.getRunnerScaleSet(runnerGroupId as number, this.config.scaleSetName, { signal })
        : await client.getRunnerScaleSetById(this.config.scaleSetId, { signal });
    if (
      registerMissing &&
      configuredScaleSet === null &&
      runnerGroupId !== undefined &&
      this.config.scaleSetId === undefined
    ) {
      this.log('info', 'scale_set_registering', {
        runnerConfigName: this.config.runnerConfigName,
        scaleSetName: this.config.scaleSetName,
        runnerGroupId,
      });
      try {
        configuredScaleSet = await client.createRunnerScaleSet(
          {
            name: this.config.scaleSetName,
            runnerGroupId,
            labels: [{ name: this.config.scaleSetName }],
            runnerSetting: {},
          },
          { signal },
        );
      } catch (error) {
        const existingScaleSet = await client.getRunnerScaleSet(runnerGroupId, this.config.scaleSetName, { signal });
        if (existingScaleSet === null) throw error;
        configuredScaleSet = existingScaleSet;
      }
    }
    if (configuredScaleSet === null || configuredScaleSet.id === undefined) {
      throw new ScaleSetConfigurationError(
        `GitHub runner scale set ${JSON.stringify(this.config.scaleSetName)} was not found`,
      );
    }
    if (
      configuredScaleSet.name !== this.config.scaleSetName ||
      (runnerGroupId !== undefined && configuredScaleSet.runnerGroupId !== runnerGroupId) ||
      (this.config.scaleSetId !== undefined && configuredScaleSet.id !== this.config.scaleSetId)
    ) {
      throw new ScaleSetConfigurationError('configured GitHub runner scale set identity does not match');
    }
    this.log('info', 'scale_set_resolved', {
      runnerConfigName: this.config.runnerConfigName,
      scaleSetName: this.config.scaleSetName,
      scaleSetId: configuredScaleSet.id,
      runnerGroupId,
    });
    return { scaleSetId: configuredScaleSet.id, runnerGroupId };
  }

  private async loadCachedRunnerGroupId(): Promise<number | undefined> {
    const parameterName = this.config.runnerGroupIdParameterName;
    if (parameterName === undefined) return undefined;
    const values = await this.dependencies.parameterStore.get([parameterName]);
    const raw = values.get(parameterName)?.trim();
    if (raw === undefined || raw === '') return undefined;
    if (!/^\d+$/.test(raw)) {
      throw new ScaleSetConfigurationError(
        `runner group ID parameter ${JSON.stringify(parameterName)} must contain a positive integer`,
      );
    }
    const id = Number(raw);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new ScaleSetConfigurationError(
        `runner group ID parameter ${JSON.stringify(parameterName)} must contain a positive integer`,
      );
    }
    return id;
  }

  private get scaleSetId(): number {
    if (this.resolvedScaleSetId === undefined) {
      throw new ScaleSetConfigurationError('scale set ID was not resolved');
    }
    return this.resolvedScaleSetId;
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
    const callbacks = this.createReconcileCallbacks(client, signal);
    let result = await this.reconcileProvider(provider, {
      desiredRunners,
      bootTimeoutMinutes: this.config.bootTimeoutMinutes,
      runnerInventoryComplete: false,
      runnerStates: this.lifecycleStates(),
      ...callbacks,
    });
    validateProviderResult(result, desiredRunners);
    throwIfProviderError(result);
    if (result.needsRunnerInventory) {
      let inventory: readonly GitHubScaleSetRunnerState[];
      try {
        this.log('info', 'scale_set_runner_inventory_loading', {
          githubConfigUrl: this.config.githubConfigUrl,
          githubApiMode: this.config.forceGhes ? 'ghes' : 'hosted',
          inventorySources: ['actions_service', 'github_rest'],
        });
        inventory = await this.loadScaleSetInventory(client, signal);
        this.log('info', 'scale_set_runner_inventory_loaded', {
          githubConfigUrl: this.config.githubConfigUrl,
          runnerCount: inventory.length,
        });
      } catch (error) {
        if (!isScaleSetHttpError(error) || error.status !== 404) throw error;
        this.log('warn', 'scale_set_runner_inventory_unavailable', {
          failureStage: 'github_runner_inventory',
          githubConfigUrl: this.config.githubConfigUrl,
          githubApiMode: this.config.forceGhes ? 'ghes' : 'hosted',
          diagnosis: 'github_endpoint_not_found_or_app_not_authorized',
          ...httpErrorLogAttributes(error),
          error,
        });
        this.logReconciliationResult(result, desiredRunners);
        return;
      }
      result = await this.reconcileProvider(provider, {
        desiredRunners,
        bootTimeoutMinutes: this.config.bootTimeoutMinutes,
        runnerInventoryComplete: true,
        runnerStates: this.mergeLifecycle(inventory),
        ...callbacks,
      });
      validateProviderResult(result, desiredRunners);
      throwIfProviderError(result);
      if (result.needsRunnerInventory) {
        throw new ScaleSetProtocolError(
          'scale-set compute provider requested inventory after a complete inventory pass',
        );
      }
    }
    this.logReconciliationResult(result, desiredRunners);
  }

  private createReconcileCallbacks(client: ScaleSetReconcilerClient, signal: AbortSignal) {
    return {
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
          this.scaleSetId,
          { signal: callbackSignal ?? signal },
        );
        if (
          jit.runner === null ||
          jit.runner.name !== runnerName ||
          jit.runner.runnerScaleSetId !== this.scaleSetId ||
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
          expected.scaleSetId !== this.scaleSetId
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
  }

  private logReconciliationResult(result: ScaleSetReconcileResult, desiredRunners: number): void {
    this.log('info', 'scale_set_reconciled', {
      computeProviderType: this.config.computeProvider.type,
      desiredRunners,
      currentRunners: result.currentRunners,
      status: result.status,
      actions: result.actions,
      errorCount: result.errors.length,
    });
    if (result.status === 'retained') {
      this.log('warn', 'scale_set_capacity_retained', {
        computeProviderType: this.config.computeProvider.type,
        desiredRunners,
        currentRunners: result.currentRunners,
        retainedBusy: result.actions.retainedBusy,
        retainedUnknown: result.actions.retainedUnknown,
      });
    }
  }

  private async reconcileProvider(
    provider: ScaleSetComputeProvider,
    request: ScaleSetReconcileRequest,
  ): Promise<ScaleSetReconcileResult> {
    this.log('info', 'scale_set_compute_provider_reconcile_started', {
      computeProviderType: this.config.computeProvider.type,
      desiredRunners: request.desiredRunners,
      recoveryOnly: request.recoveryOnly ?? false,
      runnerInventoryComplete: request.runnerInventoryComplete,
    });
    try {
      return await provider.reconcile(request);
    } catch (error) {
      request.signal.throwIfAborted();
      this.log('error', 'scale_set_compute_provider_reconcile_failed', {
        computeProviderType: this.config.computeProvider.type,
        desiredRunners: request.desiredRunners,
        recoveryOnly: request.recoveryOnly ?? false,
        runnerInventoryComplete: request.runnerInventoryComplete,
        error,
      });
      throw new ScaleSetProviderReconciliationError(undefined, { cause: error });
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
    this.lifecycle.set(runnerName, { runnerId, runnerName, scaleSetId: this.scaleSetId, lifecycle });
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
    ]).then(([actionsRunners, githubRunners]) => joinRunnerInventory(actionsRunners, githubRunners, this.scaleSetId));
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
      scaleSetId: this.resolvedScaleSetId,
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
  const resultFields = new Set([
    'status',
    'desiredRunners',
    'currentRunners',
    'needsRunnerInventory',
    'actions',
    'errors',
  ]);
  if (Object.keys(record).some((key) => !resultFields.has(key))) {
    throw new ScaleSetProtocolError('scale-set compute provider returned an invalid reconciliation result');
  }
  const statuses = new Set(['converged', 'retained', 'error']);
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
  const actionFields = new Set(['launched', 'terminated', 'retainedBusy', 'retainedUnknown']);
  if (Object.keys(actions).some((key) => !actionFields.has(key))) {
    throw new ScaleSetProtocolError('scale-set compute provider returned invalid action counts');
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
  const errorFields = new Set(['operation', 'code', 'runnerName', 'resourceId']);
  for (const error of record.errors) {
    if (typeof error !== 'object' || error === null || Array.isArray(error)) {
      throw new ScaleSetProtocolError('scale-set compute provider returned invalid error metadata');
    }
    const metadata = error as Record<string, unknown>;
    if (
      Object.keys(metadata).some((key) => !errorFields.has(key)) ||
      !operations.has(metadata.operation as string) ||
      typeof metadata.code !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(metadata.code) ||
      !optionalBoundedMetadata(metadata.runnerName) ||
      !optionalBoundedMetadata(metadata.resourceId)
    ) {
      throw new ScaleSetProtocolError('scale-set compute provider returned invalid error metadata');
    }
  }
  if ((record.status === 'error') !== record.errors.length > 0) {
    throw new ScaleSetProtocolError('scale-set compute provider returned invalid error status');
  }
  let expectedStatus: ScaleSetReconcileResult['status'] = 'converged';
  if (record.errors.length > 0 || (record.currentRunners as number) < desiredRunners) {
    expectedStatus = 'error';
  } else if (record.needsRunnerInventory || (record.currentRunners as number) > desiredRunners) {
    expectedStatus = 'retained';
  }
  if (record.status !== expectedStatus) {
    throw new ScaleSetProtocolError('scale-set compute provider returned invalid reconciliation status');
  }
}

function throwIfProviderError(result: ScaleSetReconcileResult): void {
  if (result.status === 'error') {
    throw new ScaleSetProviderReconciliationError(result);
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
  if (error instanceof ScaleSetProviderReconciliationError) return true;
  if (!isScaleSetHttpError(error)) return false;
  return error.status >= 400 && error.status < 500 && ![408, 409, 425, 429].includes(error.status);
}

function httpErrorLogAttributes(error: unknown): Record<string, unknown> {
  if (!isScaleSetHttpError(error)) return {};
  return {
    requestMethod: error.method,
    requestUrl: error.url,
    requestStatus: error.status,
    requestCode: error.code,
  };
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
