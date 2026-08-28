import { createHash } from 'node:crypto';

export const SCALE_SET_CONTROLLER_MANIFEST_VERSION = 1;
export const MAX_MANIFEST_BYTES = 256 * 1024;

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };

export interface GitHubAppParameterReferences {
  appIdParameterName: string;
  installationIdParameterName: string;
  privateKeyParameterName: string;
}

export interface ScaleSetReconcilerConfig {
  schemaVersion: 1;
  runnerConfigName: string;
  scaleSetId?: number;
  scaleSetName: string;
  runnerGroupName?: string;
  expectedRunnerGroupId?: number;
  githubConfigUrl: string;
  githubApp: GitHubAppParameterReferences;
  computeProvider: {
    type: string;
    configuration: Readonly<Record<string, JsonValue>>;
  };
  minRunners: number;
  maxRunners: number;
  bootTimeoutMinutes: number;
  sessionOwner: string;
  workFolder: string;
  forceGhes: boolean;
  sslVerify: boolean;
  userAgent?: string;
}

export interface ScaleSetControllerManifest {
  version: typeof SCALE_SET_CONTROLLER_MANIFEST_VERSION;
  groupName: string;
  revision?: string;
  reconcilers: readonly ScaleSetReconcilerConfig[];
}

export interface ScaleSetServiceConfig {
  manifest?: string;
  groupConfigPath?: string;
  groupName?: string;
  groupRevision?: string;
  healthPort: number;
  healthStaleAfterMs: number;
  shutdownTimeoutMs: number;
  sessionCloseTimeoutMs: number;
  reconnectInitialBackoffMs: number;
  reconnectMaxBackoffMs: number;
}

export type ScaleSetServiceEnvironment = Readonly<Record<string, string | undefined>>;

const MAX_SCALE_SET_CAPACITY = 2_147_483_647;
const DEFAULT_BOOT_TIMEOUT_MINUTES = 10;
const MAX_BOOT_TIMEOUT_MINUTES = 120;
const DEFAULT_HEALTH_PORT = 8080;
const DEFAULT_HEALTH_STALE_AFTER_SECONDS = 180;
const DEFAULT_SHUTDOWN_TIMEOUT_SECONDS = 110;
const DEFAULT_SESSION_CLOSE_TIMEOUT_SECONDS = 10;
const DEFAULT_RECONNECT_INITIAL_BACKOFF_SECONDS = 1;
const DEFAULT_RECONNECT_MAX_BACKOFF_SECONDS = 30;
const MAX_RECONCILERS = 1000;
const MAX_PROVIDER_CONFIG_NODES = 10_000;
const MAX_PROVIDER_CONFIG_DEPTH = 32;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_PROVIDER_TYPE = /^[a-z][a-z0-9_-]{0,63}$/;
const SAFE_SSM_PARAMETER = /^\/[A-Za-z0-9_.\-/]{1,2047}$/;
const PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export class ScaleSetConfigurationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ScaleSetConfigurationError';
  }
}

function parseInteger(
  environment: ScaleSetServiceEnvironment,
  name: string,
  options: { defaultValue: number; minimum: number; maximum: number },
): number {
  const raw = environment[name]?.trim();
  if (!raw) return options.defaultValue;
  if (!/^\d+$/.test(raw)) throw new ScaleSetConfigurationError(`${name} must be an integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < options.minimum || value > options.maximum) {
    throw new ScaleSetConfigurationError(`${name} must be between ${options.minimum} and ${options.maximum}`);
  }
  return value;
}

export function parseScaleSetServiceConfig(environment: ScaleSetServiceEnvironment): ScaleSetServiceConfig {
  const manifest = environment.SCALE_SET_CONTROLLER_MANIFEST?.trim();
  const groupConfigPath = environment.SCALE_SET_CONTROLLER_GROUP_CONFIG_PATH?.trim();
  if ((manifest === undefined || manifest === '') === (groupConfigPath === undefined || groupConfigPath === '')) {
    throw new ScaleSetConfigurationError(
      'provide exactly one of SCALE_SET_CONTROLLER_MANIFEST or SCALE_SET_CONTROLLER_GROUP_CONFIG_PATH',
    );
  }
  if (manifest !== undefined && Buffer.byteLength(manifest, 'utf8') > MAX_MANIFEST_BYTES) {
    throw new ScaleSetConfigurationError(`SCALE_SET_CONTROLLER_MANIFEST must not exceed ${MAX_MANIFEST_BYTES} bytes`);
  }
  let groupName: string | undefined;
  let groupRevision: string | undefined;
  if (groupConfigPath !== undefined) {
    validateSsmParameterName(groupConfigPath, 'group config path');
    groupName = validateSafeName(environment.SCALE_SET_CONTROLLER_GROUP_NAME?.trim() ?? '', 'group name');
    groupRevision = environment.SCALE_SET_CONTROLLER_GROUP_CONFIG_REVISION?.trim();
    if (!groupRevision || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(groupRevision)) {
      throw new ScaleSetConfigurationError('SCALE_SET_CONTROLLER_GROUP_CONFIG_REVISION is invalid');
    }
  }

  const reconnectInitialBackoffMs =
    parseInteger(environment, 'SCALE_SET_RECONNECT_INITIAL_BACKOFF_SECONDS', {
      defaultValue: DEFAULT_RECONNECT_INITIAL_BACKOFF_SECONDS,
      minimum: 1,
      maximum: 300,
    }) * 1000;
  const reconnectMaxBackoffMs =
    parseInteger(environment, 'SCALE_SET_RECONNECT_MAX_BACKOFF_SECONDS', {
      defaultValue: DEFAULT_RECONNECT_MAX_BACKOFF_SECONDS,
      minimum: 1,
      maximum: 3600,
    }) * 1000;
  if (reconnectInitialBackoffMs > reconnectMaxBackoffMs) {
    throw new ScaleSetConfigurationError(
      'SCALE_SET_RECONNECT_INITIAL_BACKOFF_SECONDS must not exceed SCALE_SET_RECONNECT_MAX_BACKOFF_SECONDS',
    );
  }

  return {
    ...(manifest ? { manifest } : {}),
    ...(groupConfigPath ? { groupConfigPath, groupName, groupRevision } : {}),
    healthPort: parseInteger(environment, 'SCALE_SET_HEALTH_PORT', {
      defaultValue: DEFAULT_HEALTH_PORT,
      minimum: 1,
      maximum: 65535,
    }),
    healthStaleAfterMs:
      parseInteger(environment, 'SCALE_SET_HEALTH_STALE_AFTER_SECONDS', {
        defaultValue: DEFAULT_HEALTH_STALE_AFTER_SECONDS,
        minimum: 30,
        maximum: 3600,
      }) * 1000,
    shutdownTimeoutMs:
      parseInteger(environment, 'SCALE_SET_SHUTDOWN_TIMEOUT_SECONDS', {
        defaultValue: DEFAULT_SHUTDOWN_TIMEOUT_SECONDS,
        minimum: 1,
        maximum: 300,
      }) * 1000,
    sessionCloseTimeoutMs:
      parseInteger(environment, 'SCALE_SET_SESSION_CLOSE_TIMEOUT_SECONDS', {
        defaultValue: DEFAULT_SESSION_CLOSE_TIMEOUT_SECONDS,
        minimum: 1,
        maximum: 60,
      }) * 1000,
    reconnectInitialBackoffMs,
    reconnectMaxBackoffMs,
  };
}

function objectValue(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ScaleSetConfigurationError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0)
    throw new ScaleSetConfigurationError(`${path} contains unknown field ${JSON.stringify(unknown[0])}`);
}

function requiredString(value: Record<string, unknown>, key: string, path: string): string {
  const result = value[key];
  if (typeof result !== 'string' || result.trim() === '') {
    throw new ScaleSetConfigurationError(`${path}.${key} must be a non-empty string`);
  }
  return result.trim();
}

function optionalString(value: Record<string, unknown>, key: string, path: string): string | undefined {
  const result = value[key];
  if (result === undefined) return undefined;
  if (typeof result !== 'string' || result.trim() === '') {
    throw new ScaleSetConfigurationError(`${path}.${key} must be a non-empty string when set`);
  }
  return result.trim();
}

function integer(value: Record<string, unknown>, key: string, path: string, minimum: number, maximum: number): number {
  const result = value[key];
  if (!Number.isSafeInteger(result) || (result as number) < minimum || (result as number) > maximum) {
    throw new ScaleSetConfigurationError(`${path}.${key} must be an integer between ${minimum} and ${maximum}`);
  }
  return result as number;
}

function optionalBoolean(value: Record<string, unknown>, key: string, path: string, fallback: boolean): boolean {
  const result = value[key];
  if (result === undefined) return fallback;
  if (typeof result !== 'boolean') throw new ScaleSetConfigurationError(`${path}.${key} must be a boolean`);
  return result;
}

function validateSafeName(value: string, path: string): string {
  if (!SAFE_NAME.test(value)) {
    throw new ScaleSetConfigurationError(
      `${path} must start with an ASCII letter or digit and contain only letters, digits, dots, underscores, or hyphens`,
    );
  }
  return value;
}

function validateSsmParameterName(value: string, path: string): string {
  if (!SAFE_SSM_PARAMETER.test(value) || value.includes('//') || value.endsWith('/')) {
    throw new ScaleSetConfigurationError(`${path} must be an absolute SSM parameter name`);
  }
  return value;
}

function validateGitHubConfigUrl(raw: string, path: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch (error) {
    throw new ScaleSetConfigurationError(`${path} must be a valid URL`, { cause: error });
  }
  if (url.protocol !== 'https:') throw new ScaleSetConfigurationError(`${path} must use HTTPS`);
  if (url.username || url.password || url.search || url.hash) {
    throw new ScaleSetConfigurationError(`${path} must not contain credentials, a query, or a fragment`);
  }
  const parts = url.pathname
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);
  if (parts.length < 1 || parts.length > 2 || (parts[0].toLowerCase() === 'enterprises' && parts.length !== 2)) {
    throw new ScaleSetConfigurationError(`${path} must identify a GitHub organization, repository, or enterprise`);
  }
  url.pathname = `/${parts.join('/')}`;
  return url.toString().replace(/\/$/, '');
}

function validateWorkFolder(value: string, path: string): string {
  if (
    value.length > 128 ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.split('/').some((part) => part === '' || part === '.' || part === '..') ||
    !/^[A-Za-z0-9._/-]+$/.test(value)
  ) {
    throw new ScaleSetConfigurationError(`${path} must be a safe relative path`);
  }
  return value;
}

function validateUserAgent(value: string | undefined, path: string): string | undefined {
  if (value === undefined) return undefined;
  if (value.length > 256 || !/^[\x20-\x7E]+$/.test(value)) {
    throw new ScaleSetConfigurationError(`${path} must contain at most 256 visible ASCII characters`);
  }
  return value;
}

function validateJsonValue(value: unknown, path: string, depth = 0, counter = { value: 0 }): JsonValue {
  counter.value += 1;
  if (counter.value > MAX_PROVIDER_CONFIG_NODES || depth > MAX_PROVIDER_CONFIG_DEPTH) {
    throw new ScaleSetConfigurationError(`${path} exceeds the provider configuration complexity limit`);
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ScaleSetConfigurationError(`${path} contains a non-finite number`);
    return value;
  }
  if (Array.isArray(value))
    return value.map((item, index) => validateJsonValue(item, `${path}[${index}]`, depth + 1, counter));
  const record = objectValue(value, path);
  const result: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
  for (const [key, child] of Object.entries(record)) {
    if (PROTOTYPE_KEYS.has(key))
      throw new ScaleSetConfigurationError(`${path} contains forbidden field ${JSON.stringify(key)}`);
    if (key.length === 0 || key.length > 128)
      throw new ScaleSetConfigurationError(`${path} contains an invalid field name`);
    result[key] = validateJsonValue(child, `${path}.${key}`, depth + 1, counter);
  }
  return result;
}

function parseGitHubApp(value: unknown, path: string): GitHubAppParameterReferences {
  const record = objectValue(value, path);
  exactKeys(record, ['appIdParameterName', 'installationIdParameterName', 'privateKeyParameterName'], path);
  return {
    appIdParameterName: validateSsmParameterName(
      requiredString(record, 'appIdParameterName', path),
      `${path}.appIdParameterName`,
    ),
    installationIdParameterName: validateSsmParameterName(
      requiredString(record, 'installationIdParameterName', path),
      `${path}.installationIdParameterName`,
    ),
    privateKeyParameterName: validateSsmParameterName(
      requiredString(record, 'privateKeyParameterName', path),
      `${path}.privateKeyParameterName`,
    ),
  };
}

function parseComputeProvider(value: unknown, path: string): ScaleSetReconcilerConfig['computeProvider'] {
  const record = objectValue(value, path);
  exactKeys(record, ['type', 'configuration'], path);
  const type = requiredString(record, 'type', path);
  if (!SAFE_PROVIDER_TYPE.test(type)) throw new ScaleSetConfigurationError(`${path}.type is invalid`);
  const configuration = validateJsonValue(record.configuration, `${path}.configuration`);
  if (typeof configuration !== 'object' || configuration === null || Array.isArray(configuration)) {
    throw new ScaleSetConfigurationError(`${path}.configuration must be an object`);
  }
  return { type, configuration };
}

export function parseScaleSetReconcilerConfig(
  value: unknown,
  index: number,
  groupName: string,
  basePath = 'manifest.reconcilers',
): ScaleSetReconcilerConfig {
  const path = `${basePath}[${index}]`;
  const record = objectValue(value, path);
  exactKeys(
    record,
    [
      'schemaVersion',
      'runnerConfigName',
      'scaleSetId',
      'scaleSetName',
      'expectedScaleSetName',
      'runnerGroupName',
      'expectedRunnerGroupId',
      'githubConfigUrl',
      'githubApp',
      'computeProvider',
      'minRunners',
      'maxRunners',
      'bootTimeoutMinutes',
      'sessionOwner',
      'workFolder',
      'forceGhes',
      'sslVerify',
      'userAgent',
    ],
    path,
  );
  const runnerConfigName = validateSafeName(
    requiredString(record, 'runnerConfigName', path),
    `${path}.runnerConfigName`,
  );
  const minRunners = integer(record, 'minRunners', path, 0, MAX_SCALE_SET_CAPACITY);
  const maxRunners = integer(record, 'maxRunners', path, 0, MAX_SCALE_SET_CAPACITY);
  const bootTimeoutMinutes =
    record.bootTimeoutMinutes === undefined
      ? DEFAULT_BOOT_TIMEOUT_MINUTES
      : integer(record, 'bootTimeoutMinutes', path, 1, MAX_BOOT_TIMEOUT_MINUTES);
  if (minRunners > maxRunners) throw new ScaleSetConfigurationError(`${path}.minRunners must not exceed maxRunners`);
  const sessionOwner = optionalString(record, 'sessionOwner', path) ?? defaultSessionOwner(groupName, runnerConfigName);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/.test(sessionOwner)) {
    throw new ScaleSetConfigurationError(`${path}.sessionOwner is invalid`);
  }
  const userAgent = validateUserAgent(optionalString(record, 'userAgent', path), `${path}.userAgent`);
  if (record.schemaVersion !== 1) throw new ScaleSetConfigurationError(`${path}.schemaVersion must be 1`);
  const expectedRunnerGroupId =
    record.expectedRunnerGroupId === undefined || record.expectedRunnerGroupId === null
      ? undefined
      : integer(record, 'expectedRunnerGroupId', path, 1, MAX_SCALE_SET_CAPACITY);
  const runnerGroupName =
    record.runnerGroupName === undefined
      ? undefined
      : validateScaleSetName(requiredString(record, 'runnerGroupName', path), `${path}.runnerGroupName`);
  if (record.scaleSetName !== undefined && record.expectedScaleSetName !== undefined) {
    throw new ScaleSetConfigurationError(`${path} must configure only one of scaleSetName or expectedScaleSetName`);
  }
  const scaleSetName = validateScaleSetName(
    requiredString(record, record.scaleSetName === undefined ? 'expectedScaleSetName' : 'scaleSetName', path),
    `${path}.scaleSetName`,
  );
  const scaleSetId =
    record.scaleSetId === undefined ? undefined : integer(record, 'scaleSetId', path, 1, MAX_SCALE_SET_CAPACITY);
  if (scaleSetId === undefined && runnerGroupName === undefined) {
    throw new ScaleSetConfigurationError(`${path}.runnerGroupName is required when scaleSetId is omitted`);
  }
  return {
    schemaVersion: 1,
    runnerConfigName,
    ...(scaleSetId === undefined ? {} : { scaleSetId }),
    scaleSetName,
    ...(runnerGroupName === undefined ? {} : { runnerGroupName }),
    ...(expectedRunnerGroupId === undefined ? {} : { expectedRunnerGroupId }),
    githubConfigUrl: validateGitHubConfigUrl(
      requiredString(record, 'githubConfigUrl', path),
      `${path}.githubConfigUrl`,
    ),
    githubApp: parseGitHubApp(record.githubApp, `${path}.githubApp`),
    computeProvider: parseComputeProvider(record.computeProvider, `${path}.computeProvider`),
    minRunners,
    maxRunners,
    bootTimeoutMinutes,
    sessionOwner,
    workFolder: validateWorkFolder(optionalString(record, 'workFolder', path) ?? '_work', `${path}.workFolder`),
    forceGhes: optionalBoolean(record, 'forceGhes', path, false),
    sslVerify: optionalBoolean(record, 'sslVerify', path, true),
    ...(userAgent === undefined ? {} : { userAgent }),
  };
}

function defaultSessionOwner(groupName: string, runnerConfigName: string): string {
  const candidate = `${groupName}.${runnerConfigName}`;
  if (candidate.length <= 256) return candidate;
  const suffix = createHash('sha256').update(candidate).digest('hex').slice(0, 16);
  return `${candidate.slice(0, 239)}.${suffix}`;
}

function validateScaleSetName(value: string, path: string): string {
  if (value.length > 128 || !/^[\x20-\x7E]+$/.test(value)) {
    throw new ScaleSetConfigurationError(`${path} must contain at most 128 visible ASCII characters`);
  }
  return value;
}

export function parseScaleSetControllerManifest(input: string | unknown): ScaleSetControllerManifest {
  let parsed = input;
  if (typeof input === 'string') {
    if (Buffer.byteLength(input, 'utf8') > MAX_MANIFEST_BYTES) {
      throw new ScaleSetConfigurationError(`controller manifest must not exceed ${MAX_MANIFEST_BYTES} bytes`);
    }
    try {
      parsed = JSON.parse(input) as unknown;
    } catch (error) {
      throw new ScaleSetConfigurationError('controller manifest must contain valid JSON', { cause: error });
    }
  }
  const manifest = objectValue(parsed, 'manifest');
  exactKeys(manifest, ['version', 'groupName', 'revision', 'reconcilers'], 'manifest');
  if (manifest.version !== SCALE_SET_CONTROLLER_MANIFEST_VERSION) {
    throw new ScaleSetConfigurationError(`manifest.version must be ${SCALE_SET_CONTROLLER_MANIFEST_VERSION}`);
  }
  const groupName = validateSafeName(requiredString(manifest, 'groupName', 'manifest'), 'manifest.groupName');
  if (
    !Array.isArray(manifest.reconcilers) ||
    manifest.reconcilers.length < 1 ||
    manifest.reconcilers.length > MAX_RECONCILERS
  ) {
    throw new ScaleSetConfigurationError(`manifest.reconcilers must contain between 1 and ${MAX_RECONCILERS} entries`);
  }
  const revision = optionalString(manifest, 'revision', 'manifest');
  if (revision !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(revision)) {
    throw new ScaleSetConfigurationError('manifest.revision is invalid');
  }
  const reconcilers = manifest.reconcilers.map((value, index) =>
    parseScaleSetReconcilerConfig(value, index, groupName),
  );
  validateUniqueReconcilers(reconcilers);
  return {
    version: SCALE_SET_CONTROLLER_MANIFEST_VERSION,
    groupName,
    ...(revision === undefined ? {} : { revision }),
    reconcilers,
  };
}

export function validateUniqueReconcilers(reconcilers: readonly ScaleSetReconcilerConfig[]): void {
  const names = new Set<string>();
  const scopedScaleSets = new Set<string>();
  for (const reconciler of reconcilers) {
    if (names.has(reconciler.runnerConfigName)) {
      throw new ScaleSetConfigurationError(
        `runner config ${JSON.stringify(reconciler.runnerConfigName)} is duplicated`,
      );
    }
    const scopedScaleSet = [
      reconciler.githubConfigUrl,
      reconciler.runnerGroupName ?? String(reconciler.expectedRunnerGroupId ?? ''),
      reconciler.scaleSetName,
    ].join('\u0000');
    if (scopedScaleSets.has(scopedScaleSet)) {
      throw new ScaleSetConfigurationError(
        `scale set ${JSON.stringify(reconciler.scaleSetName)} is duplicated within GitHub scope ${JSON.stringify(reconciler.githubConfigUrl)}`,
      );
    }
    names.add(reconciler.runnerConfigName);
    scopedScaleSets.add(scopedScaleSet);
  }
}
