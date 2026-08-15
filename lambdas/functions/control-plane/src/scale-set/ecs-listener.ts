import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import {
  GitHubActionsScaleSetClient,
  githubApiUrl,
  isScaleSetHttpError,
  parseGitHubConfigUrl,
  ScaleSetProtocolError,
  type GitHubActionsScaleSetClientOptions,
  type MessageSessionClient,
  type ParsedGitHubConfig,
  type SystemInfo,
} from '@aws-github-runner/github-actions-scale-set';
import type { RunnerType } from '@aws-github-runner/compute-providers/core';
import {
  resolveComputeProviderType,
  type ComputeProviderType,
} from '@aws-github-runner/compute-providers/provider-types';
import { scaleSetProviderRegistry } from '@aws-github-runner/compute-providers/scale-set';
import { createServer, type Server } from 'node:http';

import {
  createGithubAppAuth,
  createGithubInstallationAuth,
  createOctokitClient,
  getStoredInstallationId,
} from '../github/auth';
import { validateSsmParameterStoreTags } from '../scale-runners/github-runner';
import {
  runScaleSetPollLoop,
  type ScaleSetApiClient,
  type ScaleSetMessageSession,
  type ScaleSetOrchestratorConfig,
  type ScaleSetProvider,
  ScaleSetReconciliationError,
} from './orchestrator';

const logger = createChildLogger('scale-set-ecs-listener');
const MAX_SCALE_SET_CAPACITY = 2_147_483_647;
const DEFAULT_RECONNECT_INITIAL_BACKOFF_MS = 1_000;
const DEFAULT_RECONNECT_MAX_BACKOFF_MS = 30_000;
const DEFAULT_SESSION_CLOSE_TIMEOUT_MS = 15_000;
const DEFAULT_HEALTH_PORT = 8_080;
const DEFAULT_HEALTH_STALE_MS = 300_000;

export type ScaleSetListenerEnvironment = Readonly<Record<string, string | undefined>>;

export interface ScaleSetListenerConfig {
  githubConfigUrl: string;
  githubConfig: ParsedGitHubConfig;
  githubApiBaseUrl: string;
  userAgent: string;
  githubAppIndex: number;
  computeProviderType: ComputeProviderType;
  sessionOwner: string;
  orchestrator: ScaleSetOrchestratorConfig;
  reconnectInitialBackoffMs: number;
  reconnectMaxBackoffMs: number;
  sessionCloseTimeoutMs: number;
  healthPort: number;
  healthStaleMs: number;
  systemInfo: SystemInfo;
}

export class ScaleSetListenerConfigurationError extends Error {
  constructor(message: string, options: ErrorOptions = {}) {
    super(message, options);
    this.name = 'ScaleSetListenerConfigurationError';
  }
}

interface RunnerScope {
  runnerOwner: string;
  runnerType: RunnerType;
}

/**
 * Load and validate all process configuration before creating a GitHub session.
 * The host deliberately accepts one scalar scale-set ID, never a list.
 */
export function loadScaleSetListenerConfig(
  environment: ScaleSetListenerEnvironment = process.env,
): ScaleSetListenerConfig {
  try {
    const githubConfigUrl = required(environment, 'SCALE_SET_GITHUB_CONFIG_URL');
    const githubConfig = parseGitHubConfigUrl(githubConfigUrl);
    const runnerScope = deriveRunnerScope(githubConfig);
    const scaleSetId = positiveInteger(environment, 'SCALE_SET_ID');
    const minRunners = nonNegativeInteger(environment, 'SCALE_SET_MIN_RUNNERS');
    const maxRunners = boundedNonNegativeInteger(environment, 'SCALE_SET_MAX_RUNNERS', MAX_SCALE_SET_CAPACITY);
    if (minRunners > maxRunners) {
      throw new ScaleSetListenerConfigurationError(
        'SCALE_SET_MIN_RUNNERS cannot be greater than SCALE_SET_MAX_RUNNERS',
      );
    }

    const githubAppIndex = nonNegativeInteger(environment, 'SCALE_SET_GITHUB_APP_INDEX', 0);
    validateGitHubAppParameterConfiguration(environment, githubAppIndex);

    const computeProviderType = resolveComputeProviderType(environment.COMPUTE_PROVIDER_TYPE);
    if (computeProviderType === 'ec2') validateEc2Environment(environment);

    const reconnectInitialBackoffMs = positiveInteger(
      environment,
      'SCALE_SET_RECONNECT_INITIAL_BACKOFF_MS',
      DEFAULT_RECONNECT_INITIAL_BACKOFF_MS,
    );
    const reconnectMaxBackoffMs = positiveInteger(
      environment,
      'SCALE_SET_RECONNECT_MAX_BACKOFF_MS',
      DEFAULT_RECONNECT_MAX_BACKOFF_MS,
    );
    if (reconnectInitialBackoffMs > reconnectMaxBackoffMs) {
      throw new ScaleSetListenerConfigurationError(
        'SCALE_SET_RECONNECT_INITIAL_BACKOFF_MS cannot be greater than SCALE_SET_RECONNECT_MAX_BACKOFF_MS',
      );
    }

    const healthPort = positiveInteger(environment, 'SCALE_SET_HEALTH_PORT', DEFAULT_HEALTH_PORT);
    if (healthPort > 65_535) {
      throw new ScaleSetListenerConfigurationError('SCALE_SET_HEALTH_PORT cannot be greater than 65535');
    }

    const tags = environment.SSM_PARAMETER_STORE_TAGS
      ? validateSsmParameterStoreTags(environment.SSM_PARAMETER_STORE_TAGS)
      : [];
    const workFolder = optionalNonEmpty(environment, 'SCALE_SET_WORK_FOLDER') ?? '_work';

    return {
      githubConfigUrl,
      githubConfig,
      githubApiBaseUrl: githubApiUrl(githubConfig, '').toString().replace(/\/$/, ''),
      userAgent: environment.USER_AGENT?.trim() || 'github-aws-runners',
      githubAppIndex,
      computeProviderType,
      sessionOwner: required(environment, 'SCALE_SET_SESSION_OWNER'),
      orchestrator: {
        scaleSetId,
        minRunners,
        maxRunners,
        runnerConfig: {
          ...runnerScope,
          runnerNamePrefix: environment.RUNNER_NAME_PREFIX ?? '',
          ssmTokenPath: required(environment, 'SSM_TOKEN_PATH'),
          ssmParameterStoreTags: tags,
        },
        workFolder,
      },
      reconnectInitialBackoffMs,
      reconnectMaxBackoffMs,
      sessionCloseTimeoutMs: positiveInteger(
        environment,
        'SCALE_SET_SESSION_CLOSE_TIMEOUT_MS',
        DEFAULT_SESSION_CLOSE_TIMEOUT_MS,
      ),
      healthPort,
      healthStaleMs: positiveInteger(environment, 'SCALE_SET_HEALTH_STALE_MS', DEFAULT_HEALTH_STALE_MS),
      systemInfo: {
        system: 'terraform-aws-github-runner',
        subsystem: 'ecs-scale-set-listener',
        version: environment.SCALE_SET_LISTENER_VERSION ?? '1.0.0',
        commitSha: environment.GIT_COMMIT_SHA ?? '',
        scaleSetId,
      },
    };
  } catch (error) {
    if (error instanceof ScaleSetListenerConfigurationError) throw error;
    throw new ScaleSetListenerConfigurationError(String(error), { cause: error });
  }
}

function deriveRunnerScope(githubConfig: ParsedGitHubConfig): RunnerScope {
  if (githubConfig.scope === 'organization' && githubConfig.organization) {
    return { runnerOwner: githubConfig.organization, runnerType: 'Org' };
  }
  if (githubConfig.scope === 'repository' && githubConfig.organization && githubConfig.repository) {
    return {
      runnerOwner: `${githubConfig.organization}/${githubConfig.repository}`,
      runnerType: 'Repo',
    };
  }
  throw new ScaleSetListenerConfigurationError(
    'Enterprise scale-set URLs are not supported by the current Org/Repo compute ownership contract',
  );
}

function required(environment: ScaleSetListenerEnvironment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new ScaleSetListenerConfigurationError(`${name} must be set to a non-empty value`);
  return value;
}

function optionalNonEmpty(environment: ScaleSetListenerEnvironment, name: string): string | undefined {
  const value = environment[name];
  if (value === undefined) return undefined;
  if (!value.trim()) throw new ScaleSetListenerConfigurationError(`${name} must be non-empty when set`);
  return value.trim();
}

function positiveInteger(environment: ScaleSetListenerEnvironment, name: string, defaultValue?: number): number {
  const value = integer(environment, name, defaultValue);
  if (value <= 0) throw new ScaleSetListenerConfigurationError(`${name} must be a positive integer`);
  return value;
}

function nonNegativeInteger(environment: ScaleSetListenerEnvironment, name: string, defaultValue?: number): number {
  const value = integer(environment, name, defaultValue);
  if (value < 0) throw new ScaleSetListenerConfigurationError(`${name} must be a non-negative integer`);
  return value;
}

function boundedNonNegativeInteger(environment: ScaleSetListenerEnvironment, name: string, maximum: number): number {
  const value = nonNegativeInteger(environment, name);
  if (value > maximum) throw new ScaleSetListenerConfigurationError(`${name} cannot be greater than ${maximum}`);
  return value;
}

function integer(environment: ScaleSetListenerEnvironment, name: string, defaultValue?: number): number {
  const rawValue = environment[name];
  if (rawValue === undefined && defaultValue !== undefined) return defaultValue;
  if (rawValue === undefined || !/^-?\d+$/.test(rawValue.trim())) {
    throw new ScaleSetListenerConfigurationError(`${name} must be an integer`);
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value)) throw new ScaleSetListenerConfigurationError(`${name} must be a safe integer`);
  return value;
}

function validateGitHubAppParameterConfiguration(
  environment: ScaleSetListenerEnvironment,
  githubAppIndex: number,
): void {
  const idParameterNames = colonSeparatedValues(required(environment, 'PARAMETER_GITHUB_APP_ID_NAME'));
  const keyParameterNames = colonSeparatedValues(required(environment, 'PARAMETER_GITHUB_APP_KEY_BASE64_NAME'));
  if (idParameterNames.length !== keyParameterNames.length) {
    throw new ScaleSetListenerConfigurationError(
      `GitHub App parameter count mismatch: ${idParameterNames.length} IDs vs ${keyParameterNames.length} keys`,
    );
  }
  if (githubAppIndex >= idParameterNames.length) {
    throw new ScaleSetListenerConfigurationError(
      `SCALE_SET_GITHUB_APP_INDEX ${githubAppIndex} does not select a configured GitHub App`,
    );
  }
}

function colonSeparatedValues(value: string): string[] {
  return value.split(':').filter((item) => item.length > 0);
}

function validateEc2Environment(environment: ScaleSetListenerEnvironment): void {
  required(environment, 'ENVIRONMENT');
  validateCommaSeparatedValues(environment, 'SUBNET_IDS');
  required(environment, 'LAUNCH_TEMPLATE_NAME');
  validateCommaSeparatedValues(environment, 'INSTANCE_TYPES');

  const targetCapacityType = required(environment, 'INSTANCE_TARGET_CAPACITY_TYPE');
  if (targetCapacityType !== 'on-demand' && targetCapacityType !== 'spot') {
    throw new ScaleSetListenerConfigurationError('INSTANCE_TARGET_CAPACITY_TYPE must be either on-demand or spot');
  }

  parseJsonStringArray(environment, 'SCALE_ERRORS');
  if (environment.ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS !== undefined) {
    parseJsonStringArray(environment, 'ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS');
  }
  if (environment.INSTANCE_TYPE_PRIORITIES !== undefined) {
    parseJsonNumberRecord(environment, 'INSTANCE_TYPE_PRIORITIES');
  }

  const runnerBootTime = Number(required(environment, 'RUNNER_BOOT_TIME_IN_MINUTES'));
  if (!Number.isFinite(runnerBootTime) || runnerBootTime <= 0) {
    throw new ScaleSetListenerConfigurationError('RUNNER_BOOT_TIME_IN_MINUTES must be a positive number');
  }
}

function validateCommaSeparatedValues(environment: ScaleSetListenerEnvironment, name: string): void {
  const values = required(environment, name).split(',');
  if (values.some((value) => !value.trim())) {
    throw new ScaleSetListenerConfigurationError(`${name} must contain only non-empty comma-separated values`);
  }
}

function parseJsonStringArray(environment: ScaleSetListenerEnvironment, name: string): string[] {
  const parsed = parseJson(environment, name);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new ScaleSetListenerConfigurationError(`${name} must be a JSON array of strings`);
  }
  return parsed;
}

function parseJsonNumberRecord(environment: ScaleSetListenerEnvironment, name: string): Record<string, number> {
  const parsed = parseJson(environment, name);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.values(parsed).some((value) => typeof value !== 'number' || !Number.isFinite(value))
  ) {
    throw new ScaleSetListenerConfigurationError(`${name} must be a JSON object with finite numeric values`);
  }
  return parsed as Record<string, number>;
}

function parseJson(environment: ScaleSetListenerEnvironment, name: string): unknown {
  const value = required(environment, name);
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new ScaleSetListenerConfigurationError(`${name} must contain valid JSON`, { cause: error });
  }
}

export type ScaleSetListenerSession = ScaleSetMessageSession & Pick<MessageSessionClient, 'close'>;

export interface ScaleSetListenerClient extends ScaleSetApiClient {
  createMessageSessionClient(
    scaleSetId: number,
    owner: string,
    options?: { signal?: AbortSignal },
  ): Promise<ScaleSetListenerSession>;
}

export interface ScaleSetListenerRuntime {
  client: ScaleSetListenerClient;
  session: ScaleSetListenerSession;
  provider: ScaleSetProvider;
}

interface SelectedGitHubApp {
  token: string;
  appIndex: number;
}

interface InstallationToken {
  token: string;
  expiresAt?: string | Date;
}

export interface ScaleSetListenerRuntimeDependencies {
  selectGitHubApp(githubApiBaseUrl: string, appIndex: number): Promise<SelectedGitHubApp>;
  getStoredInstallationId(appIndex: number): Promise<number | undefined>;
  resolveInstallationId(githubConfig: ParsedGitHubConfig, appToken: string, githubApiBaseUrl: string): Promise<number>;
  createInstallationToken(
    installationId: number,
    githubApiBaseUrl: string,
    appIndex: number,
  ): Promise<InstallationToken>;
  createClient(options: GitHubActionsScaleSetClientOptions): ScaleSetListenerClient;
  createProvider(type: ComputeProviderType): ScaleSetProvider;
}

export interface ScaleSetListenerPlatformDependencies {
  createGithubAppAuth: typeof createGithubAppAuth;
  createGithubInstallationAuth: typeof createGithubInstallationAuth;
  createOctokitClient: typeof createOctokitClient;
  getStoredInstallationId: typeof getStoredInstallationId;
  createClient(options: GitHubActionsScaleSetClientOptions): ScaleSetListenerClient;
  createProvider(type: ComputeProviderType): ScaleSetProvider;
}

const defaultPlatformDependencies: ScaleSetListenerPlatformDependencies = {
  createGithubAppAuth,
  createGithubInstallationAuth,
  createOctokitClient,
  getStoredInstallationId,
  createClient: (options) => new GitHubActionsScaleSetClient(options),
  createProvider: (type) => scaleSetProviderRegistry.capability(type, 'scaleSet')(),
};

export function createScaleSetListenerRuntimeDependencies(
  platform: ScaleSetListenerPlatformDependencies = defaultPlatformDependencies,
): ScaleSetListenerRuntimeDependencies {
  return {
    selectGitHubApp: async (githubApiBaseUrl, appIndex) => {
      const authentication = await platform.createGithubAppAuth(undefined, githubApiBaseUrl, appIndex);
      return { token: authentication.token, appIndex: authentication.appIndex };
    },
    getStoredInstallationId: platform.getStoredInstallationId,
    resolveInstallationId: async (githubConfig, appToken, githubApiBaseUrl) => {
      const githubAppClient = await platform.createOctokitClient(appToken, githubApiBaseUrl);
      if (githubConfig.scope === 'organization' && githubConfig.organization) {
        return (await githubAppClient.apps.getOrgInstallation({ org: githubConfig.organization })).data.id;
      }
      if (githubConfig.scope === 'repository' && githubConfig.organization && githubConfig.repository) {
        return (
          await githubAppClient.apps.getRepoInstallation({
            owner: githubConfig.organization,
            repo: githubConfig.repository,
          })
        ).data.id;
      }
      throw new ScaleSetListenerConfigurationError('Cannot resolve a GitHub App installation for this URL scope');
    },
    createInstallationToken: async (installationId, githubApiBaseUrl, appIndex) => {
      const authentication = await platform.createGithubInstallationAuth(installationId, githubApiBaseUrl, appIndex);
      return { token: authentication.token, expiresAt: authentication.expiresAt };
    },
    createClient: platform.createClient,
    createProvider: platform.createProvider,
  };
}

const defaultRuntimeDependencies = createScaleSetListenerRuntimeDependencies();

/** Create one GitHub message session and one provider instance for the configured scale set. */
export async function createScaleSetListenerRuntime(
  config: ScaleSetListenerConfig,
  signal?: AbortSignal,
  dependencies: ScaleSetListenerRuntimeDependencies = defaultRuntimeDependencies,
): Promise<ScaleSetListenerRuntime> {
  const provider = dependencies.createProvider(config.computeProviderType);
  const selectedApp = await dependencies.selectGitHubApp(config.githubApiBaseUrl, config.githubAppIndex);
  const storedInstallationId = await dependencies.getStoredInstallationId(selectedApp.appIndex);
  const installationId =
    storedInstallationId ??
    (await dependencies.resolveInstallationId(config.githubConfig, selectedApp.token, config.githubApiBaseUrl));
  if (!Number.isSafeInteger(installationId) || installationId <= 0) {
    throw new ScaleSetListenerConfigurationError('The selected GitHub App installation ID must be positive');
  }

  const client = dependencies.createClient({
    gitHubConfigUrl: config.githubConfigUrl,
    systemInfo: config.systemInfo,
    userAgent: config.userAgent,
    accessTokenProvider: async () =>
      await dependencies.createInstallationToken(installationId, config.githubApiBaseUrl, selectedApp.appIndex),
  });
  const session = await client.createMessageSessionClient(config.orchestrator.scaleSetId, config.sessionOwner, {
    signal,
  });
  return { client, session, provider };
}

export interface ScaleSetListenerLogger {
  info(message: string, attributes?: Record<string, unknown>): void;
  warn(message: string, attributes?: Record<string, unknown>): void;
}

export interface ScaleSetListenerHealthReporter {
  markSessionReady(): void;
  markProgress(): void;
  markFailure(error: unknown, fatal: boolean): void;
}

export interface ScaleSetListenerDependencies {
  createRuntime(config: ScaleSetListenerConfig, signal?: AbortSignal): Promise<ScaleSetListenerRuntime>;
  runPollLoop: typeof runScaleSetPollLoop;
  sleep(delayMs: number, signal?: AbortSignal): Promise<void>;
  random(): number;
  createCloseSignal(timeoutMs: number): AbortSignal;
  isFatal(error: unknown): boolean;
  logger: ScaleSetListenerLogger;
  health: ScaleSetListenerHealthReporter;
}

const noOpHealthReporter: ScaleSetListenerHealthReporter = {
  markSessionReady: () => undefined,
  markProgress: () => undefined,
  markFailure: () => undefined,
};

const defaultListenerDependencies: ScaleSetListenerDependencies = {
  createRuntime: createScaleSetListenerRuntime,
  runPollLoop: runScaleSetPollLoop,
  sleep: abortableSleep,
  random: Math.random,
  createCloseSignal: AbortSignal.timeout,
  isFatal: isFatalScaleSetListenerError,
  logger: {
    info: (message, attributes) => logger.info(message, attributes ?? {}),
    warn: (message, attributes) => logger.warn(message, attributes ?? {}),
  },
  health: noOpHealthReporter,
};

export function createScaleSetListenerDependencies(
  health: ScaleSetListenerHealthReporter = noOpHealthReporter,
): ScaleSetListenerDependencies {
  return { ...defaultListenerDependencies, health };
}

/**
 * Supervise the long poll forever. Every non-fatal failure closes the old session,
 * waits with capped equal-jitter backoff, and creates a new session.
 */
export async function runScaleSetListener(
  config: ScaleSetListenerConfig,
  signal: AbortSignal,
  dependencies: ScaleSetListenerDependencies = createScaleSetListenerDependencies(),
): Promise<void> {
  let consecutiveFailures = 0;

  while (!signal.aborted) {
    let runtime: ScaleSetListenerRuntime | undefined;
    let madeProgress = false;
    try {
      runtime = await dependencies.createRuntime(config, signal);
      dependencies.health.markSessionReady();
      dependencies.logger.info('Created GitHub scale-set message session', {
        scaleSetId: config.orchestrator.scaleSetId,
        sessionOwner: config.sessionOwner,
      });

      await dependencies.runPollLoop({
        client: runtime.client,
        session: runtime.session,
        provider: runtime.provider,
        config: config.orchestrator,
        signal,
        onPoll: () => {
          madeProgress = true;
          consecutiveFailures = 0;
          dependencies.health.markProgress();
        },
      });
      if (!signal.aborted) throw new Error('Scale-set poll loop stopped without a shutdown signal');
    } catch (error) {
      if (signal.aborted) break;
      const fatal = dependencies.isFatal(error);
      dependencies.health.markFailure(error, fatal);
      if (fatal) throw error;

      consecutiveFailures = madeProgress ? 1 : consecutiveFailures + 1;
      dependencies.logger.warn('Scale-set listener failed; recreating the message session', {
        scaleSetId: config.orchestrator.scaleSetId,
        consecutiveFailures,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (runtime) {
        await closeScaleSetSession(
          runtime.session,
          config.sessionCloseTimeoutMs,
          dependencies.createCloseSignal,
          dependencies.logger,
        );
      }
    }

    if (signal.aborted) break;
    const reconnectDelayMs = calculateReconnectDelay(
      consecutiveFailures,
      config.reconnectInitialBackoffMs,
      config.reconnectMaxBackoffMs,
      dependencies.random,
    );
    await dependencies.sleep(reconnectDelayMs, signal);
  }
}

export function calculateReconnectDelay(
  attempt: number,
  initialBackoffMs: number,
  maxBackoffMs: number,
  random: () => number = Math.random,
): number {
  if (!Number.isInteger(attempt) || attempt <= 0) throw new Error('attempt must be a positive integer');
  if (!Number.isFinite(initialBackoffMs) || initialBackoffMs <= 0) {
    throw new Error('initialBackoffMs must be positive');
  }
  if (!Number.isFinite(maxBackoffMs) || maxBackoffMs < initialBackoffMs) {
    throw new Error('maxBackoffMs must be at least initialBackoffMs');
  }

  const exponent = Math.min(attempt - 1, 30);
  const ceiling = Math.min(maxBackoffMs, initialBackoffMs * 2 ** exponent);
  const randomValue = Math.max(0, Math.min(1, random()));
  return Math.floor(ceiling / 2 + (ceiling / 2) * randomValue);
}

export async function abortableSleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted || delayMs <= 0) return;

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(done, delayMs);
    signal?.addEventListener('abort', done, { once: true });

    function done() {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', done);
      resolve();
    }
  });
}

export async function closeScaleSetSession(
  session: Pick<MessageSessionClient, 'close'>,
  timeoutMs: number,
  createCloseSignal: (timeoutMs: number) => AbortSignal = AbortSignal.timeout,
  sessionLogger: ScaleSetListenerLogger = defaultListenerDependencies.logger,
): Promise<void> {
  try {
    // This signal must not be derived from the already-aborted poll signal. It gives
    // DELETE /sessions its own bounded opportunity during SIGTERM/SIGINT shutdown.
    await session.close({ signal: createCloseSignal(timeoutMs) });
  } catch (error) {
    sessionLogger.warn('Failed to close GitHub scale-set message session', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function isFatalScaleSetListenerError(error: unknown): boolean {
  if (error instanceof ScaleSetListenerConfigurationError || error instanceof ScaleSetProtocolError) return true;
  if (error instanceof ScaleSetReconciliationError) return error.result.nonRetryableErrorCount > 0;
  if (isScaleSetHttpError(error)) return isPermanentClientErrorStatus(error.status);

  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status?: unknown }).status
      : undefined;
  return typeof status === 'number' && isPermanentClientErrorStatus(status);
}

function isPermanentClientErrorStatus(status: number): boolean {
  return status >= 400 && status < 500 && ![408, 409, 425, 429].includes(status);
}

export type ScaleSetListenerHealthStatus = 'starting' | 'healthy' | 'reconnecting' | 'stale' | 'fatal' | 'stopping';

export interface ScaleSetListenerHealthSnapshot {
  healthy: boolean;
  status: ScaleSetListenerHealthStatus;
  startedAt: string;
  lastProgressAt?: string;
  consecutiveFailures: number;
  lastErrorName?: string;
}

/** In-memory liveness state; it performs no filesystem writes. */
export class ScaleSetListenerHealth implements ScaleSetListenerHealthReporter {
  private readonly startedAt: number;
  private firstSessionAt?: number;
  private lastProgressAt?: number;
  private consecutiveFailures = 0;
  private lastErrorName?: string;
  private fatal = false;
  private stopping = false;

  constructor(
    private readonly staleAfterMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.startedAt = now();
  }

  markSessionReady(): void {
    // Seed a bounded startup liveness window once. Recreated sessions must not
    // refresh it or clear failures when every first queue poll keeps failing.
    this.firstSessionAt ??= this.now();
  }

  markProgress(): void {
    this.lastProgressAt = this.now();
    this.consecutiveFailures = 0;
    this.lastErrorName = undefined;
  }

  markFailure(error: unknown, fatal: boolean): void {
    this.consecutiveFailures++;
    this.lastErrorName = error instanceof Error ? error.name : typeof error;
    this.fatal ||= fatal;
  }

  markStopping(): void {
    this.stopping = true;
  }

  snapshot(): ScaleSetListenerHealthSnapshot {
    const now = this.now();
    const livenessAt = this.lastProgressAt ?? this.firstSessionAt;
    const stale = livenessAt !== undefined && now - livenessAt > this.staleAfterMs;
    const healthy = livenessAt !== undefined && !stale && !this.fatal && !this.stopping;
    let status: ScaleSetListenerHealthStatus;
    if (this.stopping) status = 'stopping';
    else if (this.fatal) status = 'fatal';
    else if (stale) status = 'stale';
    else if (this.consecutiveFailures > 0) status = 'reconnecting';
    else if (this.lastProgressAt === undefined) status = 'starting';
    else status = 'healthy';

    return {
      healthy,
      status,
      startedAt: new Date(this.startedAt).toISOString(),
      ...(this.lastProgressAt === undefined ? {} : { lastProgressAt: new Date(this.lastProgressAt).toISOString() }),
      consecutiveFailures: this.consecutiveFailures,
      ...(this.lastErrorName === undefined ? {} : { lastErrorName: this.lastErrorName }),
    };
  }
}

export interface ScaleSetHealthServer {
  port: number;
  close(): Promise<void>;
}

/** Bind an unauthenticated health endpoint to container loopback only. */
export async function startScaleSetHealthServer(
  health: ScaleSetListenerHealth,
  port: number,
): Promise<ScaleSetHealthServer> {
  const server = createServer((request, response) => {
    response.setHeader('Connection', 'close');
    response.setHeader('Content-Type', 'application/json');
    if (request.method !== 'GET' || request.url !== '/healthz') {
      response.statusCode = 404;
      response.end(JSON.stringify({ status: 'not-found' }));
      return;
    }

    const snapshot = health.snapshot();
    response.statusCode = snapshot.healthy ? 200 : 503;
    response.end(JSON.stringify(snapshot));
  });

  await listenOnLoopback(server, port);
  // A successful TCP listen on a numeric loopback port always returns AddressInfo.
  const address = server.address() as import('node:net').AddressInfo;

  return {
    port: address.port,
    close: async () => await closeServer(server),
  };
}

async function listenOnLoopback(server: Server, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once('error', onError);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', onError);
      resolve();
    });
  });
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}
