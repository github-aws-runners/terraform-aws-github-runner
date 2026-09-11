import type { Tag as SsmTag } from '@aws-sdk/client-ssm';

import type { Ec2OverrideConfig, RunnerInputParameters } from '../runners.d';
import { isRecord, Ec2ScaleSetValidationError } from './reconcile';

const SPOT_ALLOCATION_STRATEGIES = new Set([
  'lowest-price',
  'diversified',
  'capacity-optimized',
  'capacity-optimized-prioritized',
  'price-capacity-optimized',
]);
const ON_DEMAND_ALLOCATION_STRATEGIES = new Set(['lowest-price', 'prioritized']);

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
  useDedicatedHost?: boolean;
  ssmKmsKeyId?: string;
  ssmParameterTags?: SsmTag[];
}

export interface CreateEc2ScaleSetProviderInput {
  runnerConfigName: string;
  scaleSetId: number;
  githubScope: string;
  configuration: Ec2ScaleSetProviderConfig;
}

function rejectUnknownKeys(value: Record<string, unknown>, allowedKeys: ReadonlySet<string>, name: string): void {
  const unknownKey = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unknownKey !== undefined) {
    throw new Ec2ScaleSetValidationError(`Unsupported EC2 scale-set configuration field '${name}.${unknownKey}'`);
  }
}

function requireString(value: unknown, name: string, pattern: RegExp, maximumLength: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength || !pattern.test(value)) {
    throw new Ec2ScaleSetValidationError(`Invalid EC2 scale-set configuration field '${name}'`);
  }
  return value;
}

function requirePossiblyEmptyString(value: unknown, name: string, pattern: RegExp, maximumLength: number): string {
  if (typeof value !== 'string' || value.length > maximumLength || !pattern.test(value)) {
    throw new Ec2ScaleSetValidationError(`Invalid EC2 scale-set configuration field '${name}'`);
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
    throw new Ec2ScaleSetValidationError(`Invalid EC2 scale-set configuration field '${name}'`);
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
    throw new Ec2ScaleSetValidationError(`Invalid EC2 scale-set configuration field '${name}'`);
  }
  const parsed = value.map((item, index) => requireString(item, `${name}[${index}]`, pattern, maximumItemLength));
  if (new Set(parsed).size !== parsed.length) {
    throw new Ec2ScaleSetValidationError(`EC2 scale-set configuration field '${name}' contains duplicate values`);
  }
  return parsed;
}

function parseInstanceTypePriorities(value: unknown): Record<string, number> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Ec2ScaleSetValidationError("Invalid EC2 scale-set configuration field 'instanceTypePriorities'");
  }

  const result = Object.create(null) as Record<string, number>;
  for (const [instanceType, priority] of Object.entries(value)) {
    requireString(instanceType, 'instanceTypePriorities key', /^[a-z0-9][a-z0-9.-]*$/, 64);
    if (typeof priority !== 'number' || !Number.isSafeInteger(priority) || priority < 0 || priority > 1000) {
      throw new Ec2ScaleSetValidationError(
        `Invalid EC2 scale-set configuration priority for instance type '${instanceType}'`,
      );
    }
    result[instanceType] = priority;
  }
  return result;
}

function requireSsmTagValue(value: unknown): string {
  if (typeof value !== 'string' || value.length > 256) {
    throw new Ec2ScaleSetValidationError("Invalid EC2 scale-set configuration field 'ssmParameterTags.Value'");
  }
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint < 32 || codePoint === 127) {
      throw new Ec2ScaleSetValidationError("Invalid EC2 scale-set configuration field 'ssmParameterTags.Value'");
    }
  }
  return value;
}

function parseEc2OverrideConfig(value: unknown): Ec2OverrideConfig | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Ec2ScaleSetValidationError("Invalid EC2 scale-set configuration field 'ec2OverrideConfig'");
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
    throw new Ec2ScaleSetValidationError('EC2 scale-set configuration contains an unsupported launch override');
  }

  const weightedCapacity = value.WeightedCapacity;
  const priority = value.Priority;
  for (const [name, number] of [
    ['WeightedCapacity', weightedCapacity],
    ['Priority', priority],
  ] as const) {
    if (number !== undefined && (typeof number !== 'number' || !Number.isFinite(number) || number < 0)) {
      throw new Ec2ScaleSetValidationError(`Invalid EC2 scale-set configuration field '${name}'`);
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
    throw new Ec2ScaleSetValidationError("Invalid EC2 scale-set configuration field 'ssmParameterTags'");
  }

  const tags: SsmTag[] = [];
  const keys = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) {
      throw new Ec2ScaleSetValidationError("Invalid EC2 scale-set configuration field 'ssmParameterTags'");
    }
    const key = requireString(item.Key, 'ssmParameterTags.Key', /^[A-Za-z0-9_.:/=+@-]+$/, 128);
    const tagValue = requireSsmTagValue(item.Value);
    if (key.toLowerCase().startsWith('aws:') || keys.has(key)) {
      throw new Ec2ScaleSetValidationError(`Invalid or duplicate SSM tag key '${key}'`);
    }
    keys.add(key);
    tags.push({ Key: key, Value: tagValue });
  }
  return tags;
}

export function parseEc2ScaleSetProviderConfig(value: unknown): Ec2ScaleSetProviderConfig {
  if (!isRecord(value)) {
    throw new Ec2ScaleSetValidationError('EC2 scale-set provider configuration must be an object');
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
      'useDedicatedHost',
      'ssmKmsKeyId',
      'ssmParameterTags',
    ]),
    'configuration',
  );
  if (!isRecord(value.ec2instanceCriteria)) {
    throw new Ec2ScaleSetValidationError("Invalid EC2 scale-set configuration field 'ec2instanceCriteria'");
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
    throw new Ec2ScaleSetValidationError("Invalid EC2 scale-set configuration field 'targetCapacityType'");
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
    throw new Ec2ScaleSetValidationError(
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
    useDedicatedHost: optionalBoolean(value.useDedicatedHost, 'useDedicatedHost'),
    ssmKmsKeyId: optionalString(value.ssmKmsKeyId, 'ssmKmsKeyId', /^[A-Za-z0-9_:/+=,.@-]+$/, 2048),
    ssmParameterTags: parseSsmTags(value.ssmParameterTags),
  };
}

export function validateFactoryInput(input: CreateEc2ScaleSetProviderInput): void {
  requireString(input.runnerConfigName, 'runnerConfigName', /^[A-Za-z0-9][A-Za-z0-9._-]*$/, 128);
  if (!Number.isSafeInteger(input.scaleSetId) || input.scaleSetId <= 0) {
    throw new Ec2ScaleSetValidationError('scaleSetId must be a positive safe integer');
  }
  validateCanonicalGitHubScope(input.githubScope);
}

function validateCanonicalGitHubScope(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
    throw new Ec2ScaleSetValidationError('githubScope must be a canonical HTTPS GitHub configuration URL');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Ec2ScaleSetValidationError('githubScope must be a canonical HTTPS GitHub configuration URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Ec2ScaleSetValidationError('githubScope must be a canonical HTTPS GitHub configuration URL');
  }
  const parts = url.pathname
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);
  if (parts.length < 1 || parts.length > 2 || (parts[0].toLowerCase() === 'enterprises' && parts.length !== 2)) {
    throw new Ec2ScaleSetValidationError('githubScope must be a canonical HTTPS GitHub configuration URL');
  }
  url.pathname = `/${parts.join('/')}`;
  const canonical = url.toString().replace(/\/$/, '');
  if (canonical !== value) {
    throw new Ec2ScaleSetValidationError('githubScope must be a canonical HTTPS GitHub configuration URL');
  }
  return value;
}
