import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { getParametersByPath } from '@aws-github-runner/aws-ssm-util';
import parser from 'cron-parser';
import moment from 'moment';

export type ScalingDownConfigList = ScalingDownConfig[];
export type EvictionStrategy = 'newest_first' | 'oldest_first';
export interface ScalingDownConfig {
  cron: string;
  idleCount: number;
  timeZone: string;
  evictionStrategy?: EvictionStrategy;
}

export interface EnvironmentScaleDownConfig {
  environment: string;
  idle_config: ScalingDownConfig[];
  minimum_running_time_in_minutes: number;
  runner_boot_time_in_minutes: number;
}

const logger = createChildLogger('scale-down-config.ts');

export abstract class ScaleDownConfigError extends Error {
  constructor(
    public readonly path: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(`Scale-down configuration '${path}' ${message}`, options);
    this.name = new.target.name;
  }
}

export class ScaleDownConfigPathError extends Error {
  constructor() {
    super('SSM parameter path prefix is required but was not provided or is empty.');
    this.name = 'ScaleDownConfigPathError';
  }
}

export class ScaleDownConfigurationsNotFoundError extends Error {
  constructor(public readonly prefix: string) {
    super(`No scale-down configuration parameters found under '${prefix}'.`);
    this.name = 'ScaleDownConfigurationsNotFoundError';
  }
}

export class InvalidIdleConfigError extends ScaleDownConfigError {
  constructor(path: string) {
    super(path, "is missing a valid 'idle_config' array.");
  }
}

export class InvalidIdleConfigEntryError extends ScaleDownConfigError {
  constructor(
    path: string,
    public readonly index: number,
  ) {
    super(path, `has an invalid idle_config entry at index ${index}.`);
  }
}

export class InvalidEvictionStrategyError extends ScaleDownConfigError {
  constructor(
    path: string,
    public readonly index: number,
    public readonly evictionStrategy: string,
  ) {
    super(path, `has an invalid evictionStrategy '${evictionStrategy}' at index ${index}.`);
  }
}

export class InvalidJsonError extends ScaleDownConfigError {
  constructor(path: string, cause: unknown) {
    super(path, 'is not valid JSON.', { cause });
  }
}

export class InvalidPrefixError extends ScaleDownConfigError {
  constructor(
    path: string,
    public readonly expectedPrefix: string,
  ) {
    super(path, `does not start with expected prefix '${expectedPrefix}'.`);
  }
}

export class MissingEnvironmentSuffixError extends ScaleDownConfigError {
  constructor(path: string) {
    super(path, 'is missing an environment suffix.');
  }
}

export class MissingMinimumRunningTimeError extends ScaleDownConfigError {
  constructor(path: string) {
    super(path, "must include 'minimum_running_time_in_minutes' as a number.");
  }
}

export class MissingRunnerBootTimeError extends ScaleDownConfigError {
  constructor(path: string) {
    super(path, "must include 'runner_boot_time_in_minutes' as a number.");
  }
}

export class InvalidEnvironmentNameError extends ScaleDownConfigError {
  constructor(
    path: string,
    public readonly environment: string,
  ) {
    super(path, `has an invalid environment name '${environment}' (environment names cannot contain slashes).`);
  }
}

type RawEnvironmentScaleDownConfig = Partial<EnvironmentScaleDownConfig> & {
  environment?: string;
};

function normalizePathPrefix(path: string): string {
  if (!path) {
    throw new ScaleDownConfigPathError();
  }

  let normalized = path.startsWith('/') ? path : `/${path}`;
  normalized = normalized.replace(/\/+$/, '');

  return normalized.length === 0 ? '/' : normalized;
}

function validateIdleConfig(idleConfig: unknown, parameterName: string): ScalingDownConfig[] {
  if (!Array.isArray(idleConfig)) {
    throw new InvalidIdleConfigError(parameterName);
  }

  return idleConfig.map((config, index) => {
    if (
      typeof config !== 'object' ||
      config === null ||
      typeof (config as ScalingDownConfig).cron !== 'string' ||
      typeof (config as ScalingDownConfig).timeZone !== 'string' ||
      typeof (config as ScalingDownConfig).idleCount !== 'number'
    ) {
      throw new InvalidIdleConfigEntryError(parameterName, index);
    }

    const evictionStrategy = (config as ScalingDownConfig).evictionStrategy;
    if (evictionStrategy && !['newest_first', 'oldest_first'].includes(evictionStrategy)) {
      throw new InvalidEvictionStrategyError(parameterName, index, evictionStrategy);
    }

    return config as ScalingDownConfig;
  });
}

function parseEnvironmentConfig(prefix: string, parameterName: string, rawValue: string): EnvironmentScaleDownConfig {
  let parsed: RawEnvironmentScaleDownConfig;
  try {
    parsed = JSON.parse(rawValue);
  } catch (error) {
    throw new InvalidJsonError(parameterName, error);
  }

  const prefixWithSeparator = prefix === '/' ? '/' : `${prefix}/`;
  if (!parameterName.startsWith(prefixWithSeparator)) {
    throw new InvalidPrefixError(parameterName, prefix);
  }

  const environment = parameterName.slice(prefixWithSeparator.length);
  if (!environment) {
    throw new MissingEnvironmentSuffixError(parameterName);
  }

  if (environment.includes('/')) {
    throw new InvalidEnvironmentNameError(parameterName, environment);
  }

  if (parsed.environment && parsed.environment !== environment) {
    logger.warn(
      `Scale-down configuration for parameter '${parameterName}' declares environment '${parsed.environment}', ` +
        `but is stored under '${environment}'. Using parameter name as source of truth.`,
    );
  }

  const minimumRunning = parsed.minimum_running_time_in_minutes;
  if (typeof minimumRunning !== 'number' || Number.isNaN(minimumRunning)) {
    throw new MissingMinimumRunningTimeError(parameterName);
  }

  const runnerBootTime = parsed.runner_boot_time_in_minutes;
  if (typeof runnerBootTime !== 'number' || Number.isNaN(runnerBootTime)) {
    throw new MissingRunnerBootTimeError(parameterName);
  }

  const idleConfig = validateIdleConfig(parsed.idle_config, parameterName);

  return {
    environment,
    idle_config: idleConfig,
    minimum_running_time_in_minutes: minimumRunning,
    runner_boot_time_in_minutes: runnerBootTime,
  };
}

export async function loadEnvironmentScaleDownConfigFromSsm(pathPrefix: string): Promise<EnvironmentScaleDownConfig[]> {
  const normalizedPrefix = normalizePathPrefix(pathPrefix);
  const parameters = await getParametersByPath(normalizedPrefix, {
    recursive: false,
  });

  const parameterEntries = Object.entries(parameters);
  if (parameterEntries.length === 0) {
    throw new ScaleDownConfigurationsNotFoundError(normalizedPrefix);
  }

  return parameterEntries.map(([name, value]) => parseEnvironmentConfig(normalizedPrefix, name, value));
}

function inPeriod(period: ScalingDownConfig): boolean {
  const now = moment(new Date());
  const expr = parser.parse(period.cron, {
    tz: period.timeZone,
  });
  const next = moment(expr.next().toDate());
  return Math.abs(next.diff(now, 'seconds')) < 5; // we keep a range of 5 seconds
}

export function getIdleRunnerCount(scalingDownConfigs: ScalingDownConfigList): number {
  for (const scalingDownConfig of scalingDownConfigs) {
    if (inPeriod(scalingDownConfig)) {
      return scalingDownConfig.idleCount;
    }
  }
  return 0;
}

export function getEvictionStrategy(scalingDownConfigs: ScalingDownConfigList): EvictionStrategy {
  for (const scalingDownConfig of scalingDownConfigs) {
    if (inPeriod(scalingDownConfig)) {
      const evictionStrategy = scalingDownConfig.evictionStrategy ?? 'oldest_first';
      logger.debug(`Using evictionStrategy '${evictionStrategy}' for period ${scalingDownConfig.cron}`);
      return evictionStrategy;
    }
  }
  return 'oldest_first';
}
