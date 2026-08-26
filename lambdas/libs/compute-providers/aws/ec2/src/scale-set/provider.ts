import { createHash } from 'node:crypto';

import { CreateTagsCommand, DescribeInstancesCommand, EC2Client, type Instance, type Tag } from '@aws-sdk/client-ec2';
import {
  DeleteParameterCommand,
  GetParameterCommand,
  PutParameterCommand,
  SSMClient,
  type Tag as SsmTag,
} from '@aws-sdk/client-ssm';

import type {
  GenerateScaleSetJitConfigurationResult,
  ScaleSetComputeProvider,
  ScaleSetReconcileActions,
  ScaleSetReconcileError,
  ScaleSetReconcileOperation,
  ScaleSetReconcileRequest,
  ScaleSetReconcileResult,
  ScaleSetRunnerState,
} from '../../../../scale-set';
import { createRunner, terminateRunner } from '../runners';
import type { Ec2OverrideConfig, RunnerInputParameters } from '../runners.d';

export const EC2_RUNNER_CONFIG_TAG = 'ghr:runner_config';
export const EC2_SCALE_SET_ID_TAG = 'ghr:scale_set_id';
export const EC2_GITHUB_SCOPE_HASH_TAG = 'ghr:github_scope_hash';
export const EC2_SCALE_SET_STATE_TAG = 'ghr:scale_set_state';
export const EC2_RUNNER_NAME_TAG = 'ghr:runner_name';
export const EC2_GITHUB_RUNNER_ID_TAG = 'ghr:github_runner_id';

const APPLICATION_TAG = 'ghr:Application';
const APPLICATION_VALUE = 'github-action-runner';
const CREATED_BY_TAG = 'ghr:created_by';
const CREATED_BY_VALUE = 'scale-set-service';
const ENVIRONMENT_TAG = 'ghr:environment';
const SSM_STANDARD_TIER_THRESHOLD = 4000;
const SSM_ADVANCED_TIER_MAX_BYTES = 8192;
const GITHUB_RUNNER_NAME_MAX_LENGTH = 64;
const RETAINED_CAPACITY_REPLACEMENT_SURGE = 1;
const MAX_BOOT_TIMEOUT_MINUTES = 120;
const SPOT_ALLOCATION_STRATEGIES = new Set([
  'lowest-price',
  'diversified',
  'capacity-optimized',
  'capacity-optimized-prioritized',
  'price-capacity-optimized',
]);
const ON_DEMAND_ALLOCATION_STRATEGIES = new Set(['lowest-price', 'prioritized']);

type Ec2ScaleSetState = 'provisioning' | 'publishing' | 'config-published' | 'retiring';

export interface Ec2ScaleSetProviderConfig {
  region: string;
  environment: string;
  runnerNamePrefix: string;
  jitConfigParameterPath: string;
  subnets: string[];
  launchTemplateName: string;
  ec2instanceCriteria: RunnerInputParameters['ec2instanceCriteria'];
  ec2OverrideConfig?: Ec2OverrideConfig;
  amiIdSsmParameterName?: string;
  tracingEnabled?: boolean;
  onDemandFailoverOnError?: string[];
  scaleErrors: string[];
  useDedicatedHost?: boolean;
  ssmKmsKeyId?: string;
  ssmParameterTags?: SsmTag[];
}

export interface Ec2ScaleSetProviderDependencies {
  ec2Client?: EC2Client;
  ssmClient?: SSMClient;
  now?: () => number;
}

export interface CreateEc2ScaleSetProviderInput {
  runnerConfigName: string;
  scaleSetId: number;
  githubScope: string;
  configuration: Ec2ScaleSetProviderConfig;
}

interface OwnedEc2Runner {
  instanceId: string;
  launchTime?: Date;
  githubRunnerId?: number;
  runnerName?: string;
  scaleSetState?: Ec2ScaleSetState;
}

interface MutableReconcileState {
  currentRunners: number;
  needsRunnerInventory: boolean;
  retainedUnknownResourceIds: Set<string>;
  actions: ScaleSetReconcileActions;
  errors: ScaleSetReconcileError[];
}

class NonRetryableScaleSetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableScaleSetError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(value: Record<string, unknown>, allowedKeys: ReadonlySet<string>, name: string): void {
  const unknownKey = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unknownKey !== undefined) {
    throw new NonRetryableScaleSetError(`Unsupported EC2 scale-set configuration field '${name}.${unknownKey}'`);
  }
}

function requireString(value: unknown, name: string, pattern: RegExp, maximumLength: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength || !pattern.test(value)) {
    throw new NonRetryableScaleSetError(`Invalid EC2 scale-set configuration field '${name}'`);
  }
  return value;
}

function requirePossiblyEmptyString(value: unknown, name: string, pattern: RegExp, maximumLength: number): string {
  if (typeof value !== 'string' || value.length > maximumLength || !pattern.test(value)) {
    throw new NonRetryableScaleSetError(`Invalid EC2 scale-set configuration field '${name}'`);
  }
  return value;
}

function optionalString(value: unknown, name: string, pattern: RegExp, maximumLength: number): string | undefined {
  if (value === undefined) return undefined;
  return requireString(value, name, pattern, maximumLength);
}

function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw new NonRetryableScaleSetError(`Invalid EC2 scale-set configuration field '${name}'`);
  }
  return value;
}

function requireStringArray(
  value: unknown,
  name: string,
  pattern: RegExp,
  maximumItemLength: number,
  allowEmpty = false,
): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.length > 100) {
    throw new NonRetryableScaleSetError(`Invalid EC2 scale-set configuration field '${name}'`);
  }
  const parsed = value.map((item, index) => requireString(item, `${name}[${index}]`, pattern, maximumItemLength));
  if (new Set(parsed).size !== parsed.length) {
    throw new NonRetryableScaleSetError(`EC2 scale-set configuration field '${name}' contains duplicate values`);
  }
  return parsed;
}

function parseInstanceTypePriorities(value: unknown): Record<string, number> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new NonRetryableScaleSetError("Invalid EC2 scale-set configuration field 'instanceTypePriorities'");
  }

  const result = Object.create(null) as Record<string, number>;
  for (const [instanceType, priority] of Object.entries(value)) {
    requireString(instanceType, 'instanceTypePriorities key', /^[a-z0-9][a-z0-9.-]*$/, 64);
    if (typeof priority !== 'number' || !Number.isSafeInteger(priority) || priority < 0 || priority > 1000) {
      throw new NonRetryableScaleSetError(
        `Invalid EC2 scale-set configuration priority for instance type '${instanceType}'`,
      );
    }
    result[instanceType] = priority;
  }
  return result;
}

function requireSsmTagValue(value: unknown): string {
  if (typeof value !== 'string' || value.length > 256) {
    throw new NonRetryableScaleSetError("Invalid EC2 scale-set configuration field 'ssmParameterTags.Value'");
  }
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint < 32 || codePoint === 127) {
      throw new NonRetryableScaleSetError("Invalid EC2 scale-set configuration field 'ssmParameterTags.Value'");
    }
  }
  return value;
}

function parseEc2OverrideConfig(value: unknown): Ec2OverrideConfig | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new NonRetryableScaleSetError("Invalid EC2 scale-set configuration field 'ec2OverrideConfig'");
  }

  const supportedKeys = new Set([
    'InstanceType',
    'MaxPrice',
    'SubnetId',
    'AvailabilityZone',
    'AvailabilityZoneId',
    'WeightedCapacity',
    'Priority',
    'ImageId',
  ]);
  if (Object.keys(value).some((key) => !supportedKeys.has(key))) {
    throw new NonRetryableScaleSetError('EC2 scale-set configuration contains an unsupported launch override');
  }

  const weightedCapacity = value.WeightedCapacity;
  const priority = value.Priority;
  for (const [name, number] of [
    ['WeightedCapacity', weightedCapacity],
    ['Priority', priority],
  ] as const) {
    if (number !== undefined && (typeof number !== 'number' || !Number.isFinite(number) || number < 0)) {
      throw new NonRetryableScaleSetError(`Invalid EC2 scale-set configuration field '${name}'`);
    }
  }

  return {
    InstanceType: optionalString(
      value.InstanceType,
      'ec2OverrideConfig.InstanceType',
      /^[a-z0-9][a-z0-9.-]*$/,
      64,
    ) as Ec2OverrideConfig['InstanceType'],
    MaxPrice: optionalString(value.MaxPrice, 'ec2OverrideConfig.MaxPrice', /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/, 32),
    SubnetId: optionalString(value.SubnetId, 'ec2OverrideConfig.SubnetId', /^subnet-[0-9a-f]+$/, 32),
    AvailabilityZone: optionalString(
      value.AvailabilityZone,
      'ec2OverrideConfig.AvailabilityZone',
      /^[a-z]{2}(?:-[a-z0-9]+)+-\d[a-z]$/,
      64,
    ),
    AvailabilityZoneId: optionalString(
      value.AvailabilityZoneId,
      'ec2OverrideConfig.AvailabilityZoneId',
      /^[a-z0-9-]+$/,
      64,
    ),
    WeightedCapacity: weightedCapacity as number | undefined,
    Priority: priority as number | undefined,
    ImageId: optionalString(value.ImageId, 'ec2OverrideConfig.ImageId', /^ami-[0-9a-f]+$/, 32),
  };
}

function parseSsmTags(value: unknown): SsmTag[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 45) {
    throw new NonRetryableScaleSetError("Invalid EC2 scale-set configuration field 'ssmParameterTags'");
  }

  const tags: SsmTag[] = [];
  const keys = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) {
      throw new NonRetryableScaleSetError("Invalid EC2 scale-set configuration field 'ssmParameterTags'");
    }
    const key = requireString(item.Key, 'ssmParameterTags.Key', /^[A-Za-z0-9_.:/=+@-]+$/, 128);
    const tagValue = requireSsmTagValue(item.Value);
    if (key.toLowerCase().startsWith('aws:') || keys.has(key)) {
      throw new NonRetryableScaleSetError(`Invalid or duplicate SSM tag key '${key}'`);
    }
    keys.add(key);
    tags.push({ Key: key, Value: tagValue });
  }
  return tags;
}

export function parseEc2ScaleSetProviderConfig(value: unknown): Ec2ScaleSetProviderConfig {
  if (!isRecord(value)) {
    throw new NonRetryableScaleSetError('EC2 scale-set provider configuration must be an object');
  }
  rejectUnknownKeys(
    value,
    new Set([
      'region',
      'environment',
      'runnerNamePrefix',
      'jitConfigParameterPath',
      'subnets',
      'launchTemplateName',
      'ec2instanceCriteria',
      'ec2OverrideConfig',
      'amiIdSsmParameterName',
      'tracingEnabled',
      'onDemandFailoverOnError',
      'scaleErrors',
      'useDedicatedHost',
      'ssmKmsKeyId',
      'ssmParameterTags',
    ]),
    'configuration',
  );
  if (!isRecord(value.ec2instanceCriteria)) {
    throw new NonRetryableScaleSetError("Invalid EC2 scale-set configuration field 'ec2instanceCriteria'");
  }
  rejectUnknownKeys(
    value.ec2instanceCriteria,
    new Set([
      'instanceTypes',
      'instanceTypePriorities',
      'targetCapacityType',
      'maxSpotPrice',
      'instanceAllocationStrategy',
    ]),
    'ec2instanceCriteria',
  );

  const targetCapacityType = value.ec2instanceCriteria.targetCapacityType;
  if (targetCapacityType !== 'on-demand' && targetCapacityType !== 'spot') {
    throw new NonRetryableScaleSetError("Invalid EC2 scale-set configuration field 'targetCapacityType'");
  }
  const instanceAllocationStrategy = requireString(
    value.ec2instanceCriteria.instanceAllocationStrategy,
    'instanceAllocationStrategy',
    /^[a-z-]+$/,
    64,
  ) as RunnerInputParameters['ec2instanceCriteria']['instanceAllocationStrategy'];
  const allowedAllocationStrategies =
    targetCapacityType === 'spot' ? SPOT_ALLOCATION_STRATEGIES : ON_DEMAND_ALLOCATION_STRATEGIES;
  if (!allowedAllocationStrategies.has(instanceAllocationStrategy)) {
    throw new NonRetryableScaleSetError(
      `Invalid allocation strategy '${instanceAllocationStrategy}' for '${targetCapacityType}' capacity`,
    );
  }

  const jitConfigParameterPath = requireString(
    value.jitConfigParameterPath,
    'jitConfigParameterPath',
    /^\/(?!.*\/\/)[A-Za-z0-9_.\-/]+$/,
    900,
  ).replace(/\/$/, '');

  return {
    region: requireString(value.region, 'region', /^[a-z]{2}(?:-[a-z0-9]+)+-\d$/, 32),
    environment: requireString(value.environment, 'environment', /^[A-Za-z0-9][A-Za-z0-9._-]*$/, 128),
    runnerNamePrefix: requirePossiblyEmptyString(value.runnerNamePrefix, 'runnerNamePrefix', /^[A-Za-z0-9._-]*$/, 45),
    jitConfigParameterPath,
    subnets: requireStringArray(value.subnets, 'subnets', /^subnet-[0-9a-f]+$/, 32),
    launchTemplateName: requireString(value.launchTemplateName, 'launchTemplateName', /^[A-Za-z0-9()./_-]+$/, 128),
    ec2instanceCriteria: {
      instanceTypes: requireStringArray(
        value.ec2instanceCriteria.instanceTypes,
        'instanceTypes',
        /^[a-z0-9][a-z0-9.-]*$/,
        64,
      ),
      instanceTypePriorities: parseInstanceTypePriorities(value.ec2instanceCriteria.instanceTypePriorities),
      targetCapacityType,
      maxSpotPrice: optionalString(
        value.ec2instanceCriteria.maxSpotPrice,
        'maxSpotPrice',
        /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/,
        32,
      ),
      instanceAllocationStrategy,
    },
    ec2OverrideConfig: parseEc2OverrideConfig(value.ec2OverrideConfig),
    amiIdSsmParameterName: optionalString(
      value.amiIdSsmParameterName,
      'amiIdSsmParameterName',
      /^\/(?!.*\/\/)[A-Za-z0-9_.\-/]+$/,
      900,
    ),
    tracingEnabled: optionalBoolean(value.tracingEnabled, 'tracingEnabled'),
    onDemandFailoverOnError: requireStringArray(
      value.onDemandFailoverOnError ?? [],
      'onDemandFailoverOnError',
      /^[A-Za-z0-9._-]+$/,
      128,
      true,
    ),
    scaleErrors: requireStringArray(value.scaleErrors ?? [], 'scaleErrors', /^[A-Za-z0-9._-]+$/, 128, true),
    useDedicatedHost: optionalBoolean(value.useDedicatedHost, 'useDedicatedHost'),
    ssmKmsKeyId: optionalString(value.ssmKmsKeyId, 'ssmKmsKeyId', /^[A-Za-z0-9_:/+=,.@-]+$/, 2048),
    ssmParameterTags: parseSsmTags(value.ssmParameterTags),
  };
}

function validateFactoryInput(input: CreateEc2ScaleSetProviderInput): void {
  requireString(input.runnerConfigName, 'runnerConfigName', /^[A-Za-z0-9][A-Za-z0-9._-]*$/, 128);
  if (!Number.isSafeInteger(input.scaleSetId) || input.scaleSetId <= 0) {
    throw new NonRetryableScaleSetError('scaleSetId must be a positive safe integer');
  }
  validateCanonicalGitHubScope(input.githubScope);
}

function validateCanonicalGitHubScope(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
    throw new NonRetryableScaleSetError('githubScope must be a canonical HTTPS GitHub configuration URL');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new NonRetryableScaleSetError('githubScope must be a canonical HTTPS GitHub configuration URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new NonRetryableScaleSetError('githubScope must be a canonical HTTPS GitHub configuration URL');
  }
  const parts = url.pathname
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);
  if (parts.length < 1 || parts.length > 2 || (parts[0].toLowerCase() === 'enterprises' && parts.length !== 2)) {
    throw new NonRetryableScaleSetError('githubScope must be a canonical HTTPS GitHub configuration URL');
  }
  url.pathname = `/${parts.join('/')}`;
  const canonical = url.toString().replace(/\/$/, '');
  if (canonical !== value) {
    throw new NonRetryableScaleSetError('githubScope must be a canonical HTTPS GitHub configuration URL');
  }
  return value;
}

function githubScopeHash(githubScope: string): string {
  return createHash('sha256').update(githubScope, 'utf8').digest('hex');
}

function runnerIdentityFromGitHubScope(githubScope: string): {
  runnerOwner: string;
  runnerType: 'Org' | 'Repo';
} {
  const pathParts = new URL(githubScope).pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (pathParts.length === 2 && pathParts[0].toLowerCase() !== 'enterprises') {
    return { runnerOwner: pathParts.join('/'), runnerType: 'Repo' };
  }

  // The legacy EC2 tags do not have an enterprise discriminator. They remain
  // informational here; exact ownership is fenced by runner config, scale-set
  // ID, and the canonical GitHub-scope hash.
  return {
    runnerOwner: pathParts[0].toLowerCase() === 'enterprises' ? pathParts[1] : pathParts[0],
    runnerType: 'Org',
  };
}

function createClients(config: Ec2ScaleSetProviderConfig, dependencies: Ec2ScaleSetProviderDependencies) {
  return {
    ec2Client: dependencies.ec2Client ?? new EC2Client({ region: config.region }),
    ssmClient:
      dependencies.ssmClient ??
      new SSMClient({
        region: config.region,
        maxAttempts: 10,
        retryMode: 'adaptive',
      }),
  };
}

function safeError(
  operation: ScaleSetReconcileOperation,
  error: unknown,
  details: Pick<ScaleSetReconcileError, 'runnerName' | 'resourceId'> = {},
): ScaleSetReconcileError {
  return {
    operation,
    code: safeErrorCode(error),
    retryable: isRetryableError(error),
    ...details,
  };
}

function safeErrorCode(error: unknown): string {
  if (error instanceof NonRetryableScaleSetError) return 'INVALID_CONFIGURATION';
  if (!isRecord(error)) return 'UNEXPECTED_ERROR';
  for (const candidate of [error.name, error.code]) {
    if (typeof candidate === 'string' && /^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(candidate)) {
      return candidate;
    }
  }
  return 'UNEXPECTED_ERROR';
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof NonRetryableScaleSetError) return false;
  if (!isRecord(error)) return true;

  const identity = [error.name, error.code]
    .filter((candidate): candidate is string => typeof candidate === 'string')
    .join(' ')
    .toLowerCase();
  if (/accessdenied|unauthor|forbidden|permission|validation|invalid|malformed|unsupported/.test(identity)) {
    return false;
  }
  if (/throttl|timeout|temporar|serviceunavailable|internalserver|network|econn|socket|slowdown/.test(identity)) {
    return true;
  }

  const metadata = isRecord(error.$metadata) ? error.$metadata : undefined;
  const status = [error.status, error.statusCode, metadata?.httpStatusCode].find(
    (candidate): candidate is number => typeof candidate === 'number',
  );
  if (status !== undefined) {
    return status >= 500 || [408, 409, 425, 429].includes(status);
  }
  return true;
}

function throwIfAborted(signal: AbortSignal, error?: unknown): void {
  if (signal.aborted || (isRecord(error) && error.name === 'AbortError')) {
    signal.throwIfAborted();
    throw error;
  }
}

function resultStatus(
  errors: readonly ScaleSetReconcileError[],
  current: number,
  desired: number,
  needsRunnerInventory: boolean,
) {
  if (errors.some((error) => !error.retryable)) return 'non_retryable_error' as const;
  if (errors.length > 0 || current < desired) return 'retryable_error' as const;
  if (needsRunnerInventory) return 'retained' as const;
  if (current > desired) return 'retained' as const;
  return 'converged' as const;
}

function finish(state: MutableReconcileState, desiredRunners: number): ScaleSetReconcileResult {
  if (desiredRunners >= 0 && state.currentRunners < desiredRunners && state.errors.length === 0) {
    state.errors.push({
      operation: 'reconcile',
      code: 'CAPACITY_NOT_PROVISIONED',
      retryable: true,
    });
  }
  return {
    status: resultStatus(state.errors, state.currentRunners, desiredRunners, state.needsRunnerInventory),
    desiredRunners,
    currentRunners: state.currentRunners,
    needsRunnerInventory: state.needsRunnerInventory,
    actions: state.actions,
    errors: state.errors,
  };
}

function emptyState(currentRunners: number): MutableReconcileState {
  return {
    currentRunners,
    needsRunnerInventory: false,
    retainedUnknownResourceIds: new Set(),
    actions: { launched: 0, terminated: 0, retainedBusy: 0, retainedUnknown: 0 },
    errors: [],
  };
}

function retainUnknown(state: MutableReconcileState, resourceId?: string): void {
  if (resourceId === undefined) {
    state.actions.retainedUnknown++;
    return;
  }
  if (state.retainedUnknownResourceIds.has(resourceId)) return;
  state.retainedUnknownResourceIds.add(resourceId);
  state.actions.retainedUnknown++;
}

function validateDesiredRunners(desiredRunners: number): ScaleSetReconcileError | undefined {
  if (!Number.isSafeInteger(desiredRunners) || desiredRunners < 0 || desiredRunners > 10000) {
    return {
      operation: 'validate',
      code: 'INVALID_DESIRED_RUNNER_COUNT',
      retryable: false,
    };
  }
  return undefined;
}

function validateBootTimeout(bootTimeoutMinutes: number): ScaleSetReconcileError | undefined {
  if (
    !Number.isSafeInteger(bootTimeoutMinutes) ||
    bootTimeoutMinutes < 1 ||
    bootTimeoutMinutes > MAX_BOOT_TIMEOUT_MINUTES
  ) {
    return {
      operation: 'validate',
      code: 'INVALID_BOOT_TIMEOUT',
      retryable: false,
    };
  }
  return undefined;
}

function validateInventorySignal(runnerInventoryComplete: unknown): ScaleSetReconcileError | undefined {
  if (typeof runnerInventoryComplete !== 'boolean') {
    return {
      operation: 'validate',
      code: 'INVALID_RUNNER_INVENTORY_SIGNAL',
      retryable: false,
    };
  }
  return undefined;
}

function ownershipTags(input: CreateEc2ScaleSetProviderInput): Tag[] {
  return [
    { Key: ENVIRONMENT_TAG, Value: input.configuration.environment },
    { Key: EC2_RUNNER_CONFIG_TAG, Value: input.runnerConfigName },
    { Key: EC2_SCALE_SET_ID_TAG, Value: String(input.scaleSetId) },
    { Key: EC2_GITHUB_SCOPE_HASH_TAG, Value: githubScopeHash(input.githubScope) },
    { Key: EC2_SCALE_SET_STATE_TAG, Value: 'provisioning' },
  ];
}

async function listOwnedRunners(
  input: CreateEc2ScaleSetProviderInput,
  ec2Client: EC2Client,
  signal: AbortSignal,
): Promise<OwnedEc2Runner[]> {
  const runners: OwnedEc2Runner[] = [];
  let nextToken: string | undefined;
  do {
    const response = await ec2Client.send(
      new DescribeInstancesCommand({
        Filters: [
          { Name: 'instance-state-name', Values: ['pending', 'running'] },
          { Name: `tag:${APPLICATION_TAG}`, Values: [APPLICATION_VALUE] },
          { Name: `tag:${CREATED_BY_TAG}`, Values: [CREATED_BY_VALUE] },
          { Name: `tag:${ENVIRONMENT_TAG}`, Values: [input.configuration.environment] },
          { Name: `tag:${EC2_RUNNER_CONFIG_TAG}`, Values: [input.runnerConfigName] },
          { Name: `tag:${EC2_SCALE_SET_ID_TAG}`, Values: [String(input.scaleSetId)] },
          { Name: `tag:${EC2_GITHUB_SCOPE_HASH_TAG}`, Values: [githubScopeHash(input.githubScope)] },
        ],
        NextToken: nextToken,
      }),
      { abortSignal: signal },
    );
    nextToken = response.NextToken;

    for (const instance of response.Reservations?.flatMap((reservation) => reservation.Instances ?? []) ?? []) {
      const runner = parseOwnedRunner(instance, input);
      if (runner) runners.push(runner);
    }
  } while (nextToken);

  return runners;
}

function parseOwnedRunner(instance: Instance, input: CreateEc2ScaleSetProviderInput): OwnedEc2Runner | undefined {
  if (!instance.InstanceId) return undefined;
  const tags = new Map((instance.Tags ?? []).flatMap((tag) => (tag.Key ? [[tag.Key, tag.Value]] : [])));

  if (
    tags.get(APPLICATION_TAG) !== APPLICATION_VALUE ||
    tags.get(CREATED_BY_TAG) !== CREATED_BY_VALUE ||
    tags.get(ENVIRONMENT_TAG) !== input.configuration.environment ||
    tags.get(EC2_RUNNER_CONFIG_TAG) !== input.runnerConfigName ||
    tags.get(EC2_SCALE_SET_ID_TAG) !== String(input.scaleSetId) ||
    tags.get(EC2_GITHUB_SCOPE_HASH_TAG) !== githubScopeHash(input.githubScope)
  ) {
    return undefined;
  }

  const taggedRunnerId = tags.get(EC2_GITHUB_RUNNER_ID_TAG);
  const githubRunnerId = taggedRunnerId === undefined ? undefined : Number(taggedRunnerId);
  const rawScaleSetState = tags.get(EC2_SCALE_SET_STATE_TAG);
  const scaleSetState = ['provisioning', 'publishing', 'config-published', 'retiring'].includes(rawScaleSetState ?? '')
    ? (rawScaleSetState as Ec2ScaleSetState)
    : undefined;

  return {
    instanceId: instance.InstanceId,
    launchTime: instance.LaunchTime,
    githubRunnerId: Number.isSafeInteger(githubRunnerId) && githubRunnerId! > 0 ? githubRunnerId : undefined,
    runnerName: tags.get(EC2_RUNNER_NAME_TAG),
    scaleSetState,
  };
}

function validRunnerState(value: ScaleSetRunnerState): boolean {
  return (
    Number.isSafeInteger(value.runnerId) &&
    value.runnerId > 0 &&
    Number.isSafeInteger(value.scaleSetId) &&
    value.scaleSetId > 0 &&
    typeof value.runnerName === 'string' &&
    value.runnerName.length > 0 &&
    value.runnerName.length <= GITHUB_RUNNER_NAME_MAX_LENGTH &&
    ['online', 'offline', 'unknown'].includes(value.status) &&
    (typeof value.busy === 'boolean' || value.busy === undefined) &&
    ['started', 'completed', 'unknown'].includes(value.lifecycle)
  );
}

function indexRunnerStates(
  runnerStates: readonly ScaleSetRunnerState[],
  scaleSetId: number,
): { byName: Map<string, ScaleSetRunnerState>; ambiguousNames: Set<string>; ambiguousIds: Set<number> } {
  const byName = new Map<string, ScaleSetRunnerState>();
  const byId = new Map<number, string>();
  const ambiguousNames = new Set<string>();
  const ambiguousIds = new Set<number>();

  for (const state of runnerStates) {
    if (!validRunnerState(state) || state.scaleSetId !== scaleSetId) continue;
    if (byName.has(state.runnerName)) ambiguousNames.add(state.runnerName);
    const existingName = byId.get(state.runnerId);
    if (existingName !== undefined && existingName !== state.runnerName) {
      ambiguousIds.add(state.runnerId);
      ambiguousNames.add(existingName);
      ambiguousNames.add(state.runnerName);
    }
    byName.set(state.runnerName, state);
    byId.set(state.runnerId, state.runnerName);
  }
  return { byName, ambiguousNames, ambiguousIds };
}

function matchingRunnerState(
  runner: OwnedEc2Runner,
  index: ReturnType<typeof indexRunnerStates>,
  scaleSetId: number,
): ScaleSetRunnerState | undefined {
  if (!runner.runnerName || !runner.githubRunnerId) return undefined;
  if (index.ambiguousNames.has(runner.runnerName) || index.ambiguousIds.has(runner.githubRunnerId)) return undefined;
  const state = index.byName.get(runner.runnerName);
  if (
    !state ||
    state.runnerId !== runner.githubRunnerId ||
    state.runnerName !== runner.runnerName ||
    state.scaleSetId !== scaleSetId
  ) {
    return undefined;
  }
  return state;
}

function isWithinBootTimeout(runner: OwnedEc2Runner, bootTimeoutMinutes: number, now: number): boolean {
  const launchTime = runner.launchTime?.getTime();
  if (launchTime === undefined || !Number.isFinite(launchTime)) return false;
  const ageMilliseconds = now - launchTime;
  return ageMilliseconds >= 0 && ageMilliseconds < bootTimeoutMinutes * 60_000;
}

function isConfirmedServingState(state: ScaleSetRunnerState): boolean {
  return state.lifecycle === 'started' || state.status === 'online';
}

function servingCapacity(
  input: CreateEc2ScaleSetProviderInput,
  runners: readonly OwnedEc2Runner[],
  request: ScaleSetReconcileRequest,
  state: MutableReconcileState,
  now: number,
): OwnedEc2Runner[] {
  const runnerStateIndex = indexRunnerStates(request.runnerStates, input.scaleSetId);
  const serving: OwnedEc2Runner[] = [];

  for (const runner of runners) {
    if (runner.scaleSetState !== 'config-published') {
      // An interrupted publication may already have been consumed. Preserve it,
      // but do not let it suppress replacement capacity indefinitely.
      retainUnknown(state, runner.instanceId);
      continue;
    }

    const githubState = matchingRunnerState(runner, runnerStateIndex, input.scaleSetId);
    if (githubState !== undefined && isConfirmedServingState(githubState)) {
      serving.push(runner);
      continue;
    }
    if (isWithinBootTimeout(runner, request.bootTimeoutMinutes, now)) {
      serving.push(runner);
      continue;
    }

    retainUnknown(state, runner.instanceId);
    if (!request.runnerInventoryComplete) {
      // Treat the stale handoff provisionally as serving until the controller
      // supplies one complete joined inventory. This avoids a blind replacement
      // before GitHub identity can be checked.
      state.needsRunnerInventory = true;
      serving.push(runner);
    }
  }

  return serving;
}

function isSafeScaleDownState(state: ScaleSetRunnerState): boolean {
  return (
    (state.lifecycle === 'completed' && state.busy !== true) ||
    (state.lifecycle !== 'started' && state.status === 'online' && state.busy === false)
  );
}

function isBusyState(state: ScaleSetRunnerState): boolean {
  return state.lifecycle === 'started' || state.busy === true;
}

async function tagRunner(instanceId: string, tags: Tag[], ec2Client: EC2Client, signal: AbortSignal): Promise<void> {
  await ec2Client.send(new CreateTagsCommand({ Resources: [instanceId], Tags: tags }), { abortSignal: signal });
}

async function getParameter(name: string, ssmClient: SSMClient, signal: AbortSignal): Promise<string> {
  const response = await ssmClient.send(new GetParameterCommand({ Name: name, WithDecryption: true }), {
    abortSignal: signal,
  });
  if (!response.Parameter?.Value) {
    throw new NonRetryableScaleSetError(`AMI parameter '${name}' has no value`);
  }
  return response.Parameter.Value;
}

function jitParameterName(config: Ec2ScaleSetProviderConfig, instanceId: string): string {
  return `${config.jitConfigParameterPath}/${instanceId}`;
}

function jitParameterTags(input: CreateEc2ScaleSetProviderInput, instanceId: string): SsmTag[] {
  const reserved = new Set(['InstanceId', EC2_RUNNER_CONFIG_TAG, EC2_SCALE_SET_ID_TAG, EC2_GITHUB_SCOPE_HASH_TAG]);
  return [
    ...(input.configuration.ssmParameterTags ?? []).filter((tag) => tag.Key && !reserved.has(tag.Key)),
    { Key: 'InstanceId', Value: instanceId },
    { Key: EC2_RUNNER_CONFIG_TAG, Value: input.runnerConfigName },
    { Key: EC2_SCALE_SET_ID_TAG, Value: String(input.scaleSetId) },
    { Key: EC2_GITHUB_SCOPE_HASH_TAG, Value: githubScopeHash(input.githubScope) },
  ];
}

async function publishJitConfiguration(
  input: CreateEc2ScaleSetProviderInput,
  instanceId: string,
  encodedJitConfiguration: string,
  ssmClient: SSMClient,
  signal: AbortSignal,
): Promise<void> {
  const valueSize = Buffer.byteLength(encodedJitConfiguration, 'utf8');
  if (valueSize === 0 || valueSize > SSM_ADVANCED_TIER_MAX_BYTES) {
    throw new NonRetryableScaleSetError('JIT configuration must be between 1 and 8192 bytes');
  }

  await ssmClient.send(
    new PutParameterCommand({
      Name: jitParameterName(input.configuration, instanceId),
      Value: encodedJitConfiguration,
      Type: 'SecureString',
      KeyId: input.configuration.ssmKmsKeyId,
      Overwrite: false,
      Tier: valueSize >= SSM_STANDARD_TIER_THRESHOLD ? 'Advanced' : 'Standard',
      Tags: jitParameterTags(input, instanceId),
    }),
    { abortSignal: signal },
  );
}

async function bestEffortCancelJitPublication(
  input: CreateEc2ScaleSetProviderInput,
  instanceId: string,
  ssmClient: SSMClient,
  signal: AbortSignal,
): Promise<void> {
  try {
    await ssmClient.send(new DeleteParameterCommand({ Name: jitParameterName(input.configuration, instanceId) }), {
      abortSignal: signal,
    });
  } catch (error) {
    throwIfAborted(signal, error);
  }
}

function validateJitResult(
  result: GenerateScaleSetJitConfigurationResult,
  expectedRunnerName: string,
  scaleSetId: number,
): void {
  if (
    !Number.isSafeInteger(result.runnerId) ||
    result.runnerId <= 0 ||
    result.runnerName !== expectedRunnerName ||
    result.scaleSetId !== scaleSetId
  ) {
    throw new NonRetryableScaleSetError('JIT configuration returned an unexpected runner identity');
  }
  const valueSize = Buffer.byteLength(result.encodedJitConfiguration, 'utf8');
  if (valueSize === 0 || valueSize > SSM_ADVANCED_TIER_MAX_BYTES) {
    throw new NonRetryableScaleSetError('JIT configuration has an invalid size');
  }
}

async function terminateUnpublishedRunner(
  instanceId: string,
  state: MutableReconcileState,
  ec2Client: EC2Client,
  signal: AbortSignal,
): Promise<void> {
  try {
    await terminateRunner(instanceId, { ec2Client, signal });
    state.currentRunners--;
    state.actions.terminated++;
  } catch (error) {
    throwIfAborted(signal, error);
    retainUnknown(state, instanceId);
    state.errors.push(safeError('terminate', error, { resourceId: instanceId }));
  }
}

async function cleanGitHubRunner(
  jit: GenerateScaleSetJitConfigurationResult,
  request: ScaleSetReconcileRequest,
  state: MutableReconcileState,
): Promise<void> {
  try {
    await request.removeRunner({
      runnerId: jit.runnerId,
      runnerName: jit.runnerName,
      scaleSetId: jit.scaleSetId,
      signal: request.signal,
    });
  } catch (error) {
    throwIfAborted(request.signal, error);
    state.errors.push(safeError('remove_runner', error, { runnerName: jit.runnerName }));
  }
}

async function configureLaunchedRunner(
  input: CreateEc2ScaleSetProviderInput,
  instanceId: string,
  request: ScaleSetReconcileRequest,
  state: MutableReconcileState,
  clients: ReturnType<typeof createClients>,
): Promise<void> {
  const runnerName = `${input.configuration.runnerNamePrefix}${instanceId}`;
  if (runnerName.length > GITHUB_RUNNER_NAME_MAX_LENGTH) {
    state.errors.push({
      operation: 'generate_jit_configuration',
      code: 'RUNNER_NAME_TOO_LONG',
      retryable: false,
      resourceId: instanceId,
    });
    await terminateUnpublishedRunner(instanceId, state, clients.ec2Client, request.signal);
    return;
  }

  let jit: GenerateScaleSetJitConfigurationResult;
  try {
    jit = await request.generateJitConfiguration({ runnerName, signal: request.signal });
    validateJitResult(jit, runnerName, input.scaleSetId);
  } catch (error) {
    throwIfAborted(request.signal, error);
    state.errors.push(safeError('generate_jit_configuration', error, { runnerName, resourceId: instanceId }));
    await terminateUnpublishedRunner(instanceId, state, clients.ec2Client, request.signal);
    return;
  }

  try {
    await tagRunner(
      instanceId,
      [
        { Key: EC2_RUNNER_NAME_TAG, Value: jit.runnerName },
        { Key: EC2_GITHUB_RUNNER_ID_TAG, Value: String(jit.runnerId) },
        { Key: EC2_SCALE_SET_STATE_TAG, Value: 'publishing' },
      ],
      clients.ec2Client,
      request.signal,
    );
  } catch (error) {
    throwIfAborted(request.signal, error);
    state.errors.push(safeError('launch', error, { runnerName, resourceId: instanceId }));
    await cleanGitHubRunner(jit, request, state);
    await terminateUnpublishedRunner(instanceId, state, clients.ec2Client, request.signal);
    return;
  }

  try {
    await publishJitConfiguration(input, instanceId, jit.encodedJitConfiguration, clients.ssmClient, request.signal);
  } catch (error) {
    throwIfAborted(request.signal, error);
    state.errors.push(safeError('publish_jit_configuration', error, { runnerName, resourceId: instanceId }));
    await bestEffortCancelJitPublication(input, instanceId, clients.ssmClient, request.signal);
    // Main's bootstrap reads before deleting. Even a successful controller-side
    // DeleteParameter can race after that read and cannot prove non-consumption.
    // Preserve both GitHub and compute state until an exact lifecycle signal is observed.
    retainUnknown(state, instanceId);
    return;
  }

  state.actions.launched++;
  try {
    await tagRunner(
      instanceId,
      [{ Key: EC2_SCALE_SET_STATE_TAG, Value: 'config-published' }],
      clients.ec2Client,
      request.signal,
    );
  } catch (error) {
    throwIfAborted(request.signal, error);
    // Publication may already have been consumed. Preserve the instance and exact GitHub identity.
    retainUnknown(state, instanceId);
    state.errors.push(safeError('launch', error, { runnerName, resourceId: instanceId }));
  }
}

async function scaleUp(
  input: CreateEc2ScaleSetProviderInput,
  count: number,
  request: ScaleSetReconcileRequest,
  state: MutableReconcileState,
  clients: ReturnType<typeof createClients>,
): Promise<void> {
  const runnerIdentity = runnerIdentityFromGitHubScope(input.githubScope);
  let createResult;
  try {
    createResult = await createRunner(
      {
        environment: input.configuration.environment,
        runnerOwner: runnerIdentity.runnerOwner,
        runnerType: runnerIdentity.runnerType,
        subnets: input.configuration.subnets,
        launchTemplateName: input.configuration.launchTemplateName,
        ec2instanceCriteria: input.configuration.ec2instanceCriteria,
        ec2OverrideConfig: input.configuration.ec2OverrideConfig,
        numberOfRunners: count,
        source: CREATED_BY_VALUE,
        amiIdSsmParameterName: input.configuration.amiIdSsmParameterName,
        tracingEnabled: input.configuration.tracingEnabled,
        onDemandFailoverOnError: input.configuration.onDemandFailoverOnError,
        scaleErrors: input.configuration.scaleErrors,
        useDedicatedHost: input.configuration.useDedicatedHost,
        additionalTags: ownershipTags(input),
      },
      {
        ec2Client: clients.ec2Client,
        getParameter: (name) => getParameter(name, clients.ssmClient, request.signal),
        signal: request.signal,
      },
    );
  } catch (error) {
    throwIfAborted(request.signal, error);
    state.errors.push(safeError('launch', error));
    return;
  }

  state.currentRunners += createResult.instances.length;
  if (createResult.retryableErrorCount > 0) {
    state.errors.push({ operation: 'launch', code: 'EC2_LAUNCH_RETRYABLE', retryable: true });
  }
  if (createResult.nonRetryableErrorCount > 0) {
    state.errors.push({ operation: 'launch', code: 'EC2_LAUNCH_NON_RETRYABLE', retryable: false });
  }

  for (const instanceId of createResult.instances) {
    request.signal.throwIfAborted();
    await configureLaunchedRunner(input, instanceId, request, state, clients);
  }
}

async function terminateKnownIdleRunner(
  runner: OwnedEc2Runner,
  githubState: ScaleSetRunnerState,
  request: ScaleSetReconcileRequest,
  state: MutableReconcileState,
  clients: ReturnType<typeof createClients>,
): Promise<boolean> {
  let removalResult;
  try {
    removalResult = await request.removeRunner({
      runnerId: githubState.runnerId,
      runnerName: githubState.runnerName,
      scaleSetId: githubState.scaleSetId,
      signal: request.signal,
    });
  } catch (error) {
    throwIfAborted(request.signal, error);
    state.errors.push(
      safeError('remove_runner', error, { runnerName: githubState.runnerName, resourceId: runner.instanceId }),
    );
    retainUnknown(state, runner.instanceId);
    return false;
  }

  if (removalResult.status === 'retained_busy') {
    state.actions.retainedBusy++;
    return false;
  }
  if (removalResult.status !== 'removed') {
    retainUnknown(state, runner.instanceId);
    if (!request.runnerInventoryComplete) state.needsRunnerInventory = true;
    return false;
  }

  try {
    await terminateRunner(runner.instanceId, { ec2Client: clients.ec2Client, signal: request.signal });
    state.currentRunners--;
    state.actions.terminated++;
    return true;
  } catch (error) {
    throwIfAborted(request.signal, error);
    state.errors.push(
      safeError('terminate', error, { runnerName: githubState.runnerName, resourceId: runner.instanceId }),
    );
    retainUnknown(state, runner.instanceId);
    return false;
  }
}

async function scaleDown(
  input: CreateEc2ScaleSetProviderInput,
  runners: readonly OwnedEc2Runner[],
  count: number,
  request: ScaleSetReconcileRequest,
  state: MutableReconcileState,
  clients: ReturnType<typeof createClients>,
): Promise<void> {
  const runnerStateIndex = indexRunnerStates(request.runnerStates, input.scaleSetId);
  const candidates: { runner: OwnedEc2Runner; githubState: ScaleSetRunnerState }[] = [];

  for (const runner of runners) {
    const githubState = matchingRunnerState(runner, runnerStateIndex, input.scaleSetId);
    if (!githubState) {
      retainUnknown(state, runner.instanceId);
      if (!request.runnerInventoryComplete) state.needsRunnerInventory = true;
    } else if (isBusyState(githubState)) {
      state.actions.retainedBusy++;
    } else if (isSafeScaleDownState(githubState)) {
      candidates.push({ runner, githubState });
    } else {
      retainUnknown(state, runner.instanceId);
      if (!request.runnerInventoryComplete) state.needsRunnerInventory = true;
    }
  }

  candidates.sort((left, right) => {
    const launchOrder = (right.runner.launchTime?.getTime() ?? 0) - (left.runner.launchTime?.getTime() ?? 0);
    return launchOrder || left.runner.instanceId.localeCompare(right.runner.instanceId);
  });

  let remaining = count;
  for (const candidate of candidates) {
    if (remaining === 0) break;
    request.signal.throwIfAborted();
    if (await terminateKnownIdleRunner(candidate.runner, candidate.githubState, request, state, clients)) {
      remaining--;
    }
  }
}

export function createEc2ScaleSetProvider(
  input: CreateEc2ScaleSetProviderInput,
  dependencies: Ec2ScaleSetProviderDependencies = {},
): ScaleSetComputeProvider {
  const normalizedInput = {
    ...input,
    configuration: parseEc2ScaleSetProviderConfig(input.configuration),
  };
  validateFactoryInput(normalizedInput);
  const clients = createClients(normalizedInput.configuration, dependencies);
  const now = dependencies.now ?? Date.now;

  return {
    async reconcile(request): Promise<ScaleSetReconcileResult> {
      request.signal.throwIfAborted();
      const validationError =
        validateDesiredRunners(request.desiredRunners) ??
        validateBootTimeout(request.bootTimeoutMinutes) ??
        validateInventorySignal(request.runnerInventoryComplete);
      if (validationError) {
        const state = emptyState(0);
        state.errors.push(validationError);
        return finish(state, request.desiredRunners);
      }

      let runners: OwnedEc2Runner[];
      try {
        runners = await listOwnedRunners(normalizedInput, clients.ec2Client, request.signal);
      } catch (error) {
        throwIfAborted(request.signal, error);
        const state = emptyState(0);
        state.errors.push(safeError('list', error));
        return finish(state, request.desiredRunners);
      }

      const state = emptyState(runners.length);
      const servingRunners = servingCapacity(normalizedInput, runners, request, state, now());

      if (servingRunners.length < request.desiredRunners) {
        const capacityDeficit = request.desiredRunners - servingRunners.length;
        const availableReplacementSlots = Math.max(
          0,
          request.desiredRunners + RETAINED_CAPACITY_REPLACEMENT_SURGE - runners.length,
        );
        const launchCount = Math.min(capacityDeficit, availableReplacementSlots);
        if (launchCount > 0) {
          await scaleUp(normalizedInput, launchCount, request, state, clients);
        }
      } else if (servingRunners.length > request.desiredRunners) {
        await scaleDown(
          normalizedInput,
          servingRunners,
          servingRunners.length - request.desiredRunners,
          request,
          state,
          clients,
        );
      }

      return finish(state, request.desiredRunners);
    },
  };
}
