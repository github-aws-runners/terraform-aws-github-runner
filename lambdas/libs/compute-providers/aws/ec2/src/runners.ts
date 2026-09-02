import {
  type BlockDeviceMapping,
  CreateFleetCommand,
  CreateFleetResult,
  CreateTagsCommand,
  DeleteTagsCommand,
  DescribeInstancesCommand,
  DescribeInstancesResult,
  RunInstancesCommand,
  type RunInstancesCommandInput,
  RunInstancesCommandOutput,
  type EC2Client,
  FleetLaunchTemplateOverridesRequest,
  FleetOnDemandAllocationStrategy,
  SpotAllocationStrategy,
  Tag,
  TerminateInstancesCommand,
  _InstanceType,
} from '@aws-sdk/client-ec2';
import { createChildLogger, tracer } from '@aws-github-runner/aws-powertools-util';
import { getParameter } from '@aws-github-runner/aws-ssm-util';
import moment from 'moment';

import type { RunnerInfo } from '../../../core';
import { getDefaultBlockDeviceNameFromLaunchTemplate } from './launch-template';
import type { Ec2RunnerCreateResult, Ec2RunnerFailureCode } from './runner-create-result';
import type { Ec2ListRunnerFilters, Ec2OverrideConfig, RunnerInputParameters } from './runners.d';

const logger = createChildLogger('runners');

interface Ec2Filter {
  Name: string;
  Values: string[];
}

export interface Ec2RunnerRequestContext {
  readonly signal: AbortSignal | undefined;
}

export interface Ec2RunnerResourceOperations {
  list(filters?: Ec2ListRunnerFilters): Promise<RunnerInfo[]>;
  create(runnerParameters: RunnerInputParameters): Promise<Ec2RunnerCreateResult>;
  terminate(instanceId: string): Promise<void>;
  tag(instanceId: string, tags: Tag[]): Promise<void>;
  untag(instanceId: string, tags: Tag[]): Promise<void>;
}

export interface Ec2RunnerProvisioningOperations extends Ec2RunnerResourceOperations {
  getDefaultBlockDeviceNameFromLaunchTemplate(launchTemplateName: string): Promise<string>;
}

export interface Ec2RunnerClient {
  forRequest(context: Ec2RunnerRequestContext): Ec2RunnerProvisioningOperations;
}

async function runWithRequestSignal<TResult>(
  signal: AbortSignal | undefined,
  operation: () => Promise<TResult>,
): Promise<TResult> {
  signal?.throwIfAborted();
  return await operation();
}

export function createEc2RunnerClient(ec2Client: EC2Client): Ec2RunnerClient {
  return {
    forRequest: ({ signal }) => ({
      list: (filters) => runWithRequestSignal(signal, () => listEc2Runners(ec2Client, filters, signal)),
      create: (runnerParameters) =>
        runWithRequestSignal(signal, () => createEc2Runner(ec2Client, runnerParameters, signal)),
      terminate: (instanceId) => runWithRequestSignal(signal, () => terminateEc2Runner(ec2Client, instanceId, signal)),
      tag: (instanceId, tags) => runWithRequestSignal(signal, () => tagEc2Runner(ec2Client, instanceId, tags, signal)),
      untag: (instanceId, tags) =>
        runWithRequestSignal(signal, () => untagEc2Runner(ec2Client, instanceId, tags, signal)),
      getDefaultBlockDeviceNameFromLaunchTemplate: (launchTemplateName) =>
        runWithRequestSignal(signal, () =>
          getDefaultBlockDeviceNameFromLaunchTemplate(ec2Client, launchTemplateName, signal),
        ),
    }),
  };
}

type FleetError = NonNullable<CreateFleetResult['Errors']>[number];

async function listEc2Runners(
  ec2Client: EC2Client,
  filters: Ec2ListRunnerFilters | undefined,
  signal: AbortSignal | undefined,
): Promise<RunnerInfo[]> {
  const ec2Filters = constructFilters(filters);
  const runners: RunnerInfo[] = [];
  for (const filter of ec2Filters) {
    runners.push(...(await getRunners(ec2Client, filter, signal)));
  }
  return runners;
}

function constructFilters(filters?: Ec2ListRunnerFilters): Ec2Filter[][] {
  const ec2Statuses = filters?.statuses ? filters.statuses : ['running', 'pending'];
  const ec2Filters: Ec2Filter[][] = [];
  const ec2FiltersBase = [{ Name: 'instance-state-name', Values: ec2Statuses }];
  if (filters) {
    if (filters.environment !== undefined) {
      ec2FiltersBase.push({ Name: 'tag:ghr:environment', Values: [filters.environment] });
    }
    if (filters.runnerType && filters.runnerOwner) {
      ec2FiltersBase.push({ Name: `tag:ghr:Type`, Values: [filters.runnerType] });
      ec2FiltersBase.push({ Name: `tag:ghr:Owner`, Values: [filters.runnerOwner] });
    }
    if (filters.orphan) {
      ec2FiltersBase.push({ Name: 'tag:ghr:orphan', Values: ['true'] });
    }
  }

  for (const key of ['tag:ghr:Application']) {
    const filter = [...ec2FiltersBase];
    filter.push({ Name: key, Values: ['github-action-runner'] });
    ec2Filters.push(filter);
  }
  return ec2Filters;
}

async function getRunners(
  ec2Client: EC2Client,
  ec2Filters: Ec2Filter[],
  signal: AbortSignal | undefined,
): Promise<RunnerInfo[]> {
  const runners: RunnerInfo[] = [];
  let nextToken;
  let hasNext = true;
  while (hasNext) {
    const instances: DescribeInstancesResult = await ec2Client.send(
      new DescribeInstancesCommand({ Filters: ec2Filters, NextToken: nextToken }),
      { abortSignal: signal },
    );
    hasNext = instances.NextToken ? true : false;
    nextToken = instances.NextToken;
    runners.push(...getRunnerInfo(instances));
  }
  return runners;
}

function getRunnerInfo(runningInstances: DescribeInstancesResult) {
  const runners: RunnerInfo[] = [];
  if (runningInstances.Reservations) {
    for (const r of runningInstances.Reservations) {
      if (r.Instances) {
        for (const i of r.Instances) {
          runners.push({
            id: i.InstanceId as string,
            launchTime: i.LaunchTime,
            owner: i.Tags?.find((e) => e.Key === 'ghr:Owner')?.Value as string,
            type: i.Tags?.find((e) => e.Key === 'ghr:Type')?.Value as RunnerInfo['type'],
            repo: i.Tags?.find((e) => e.Key === 'ghr:Repo')?.Value as string,
            org: i.Tags?.find((e) => e.Key === 'ghr:Org')?.Value as string,
            orphan: i.Tags?.find((e) => e.Key === 'ghr:orphan')?.Value === 'true',
            githubRunnerId: i.Tags?.find((e) => e.Key === 'ghr:github_runner_id')?.Value as string,
            bypassRemoval: i.Tags?.find((e) => e.Key === 'ghr:bypass-removal')?.Value === 'true',
          });
        }
      }
    }
  }
  return runners;
}

async function terminateEc2Runner(
  ec2Client: EC2Client,
  instanceId: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  logger.debug(`Runner '${instanceId}' will be terminated.`);
  await ec2Client.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }), { abortSignal: signal });
  logger.debug(`Runner ${instanceId} has been terminated.`);
}

async function tagEc2Runner(
  ec2Client: EC2Client,
  instanceId: string,
  tags: Tag[],
  signal: AbortSignal | undefined,
): Promise<void> {
  logger.debug(`Tagging '${instanceId}'`, { tags });
  await ec2Client.send(new CreateTagsCommand({ Resources: [instanceId], Tags: tags }), { abortSignal: signal });
}

async function untagEc2Runner(
  ec2Client: EC2Client,
  instanceId: string,
  tags: Tag[],
  signal: AbortSignal | undefined,
): Promise<void> {
  logger.debug(`Untagging '${instanceId}'`, { tags });
  await ec2Client.send(new DeleteTagsCommand({ Resources: [instanceId], Tags: tags }), { abortSignal: signal });
}

const SPOT_ALLOCATION_STRATEGIES = [
  'lowest-price',
  'diversified',
  'capacity-optimized',
  'capacity-optimized-prioritized',
  'price-capacity-optimized',
];
const ON_DEMAND_ALLOCATION_STRATEGIES = ['lowest-price', 'prioritized'];

interface AwsErrorLike extends Error {
  code?: string;
  cause?: unknown;
  $fault?: 'client' | 'server';
  $metadata?: {
    httpStatusCode?: number;
  };
}

const MAX_ERROR_CAUSE_DEPTH = 10;
const SAFE_FAILURE_IDENTIFIER = /^[A-Za-z][A-Za-z0-9._-]{0,127}$/;

function safeFailureIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_FAILURE_IDENTIFIER.test(value) ? value : undefined;
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requestFailureCodes(error: unknown): Ec2RunnerFailureCode[] {
  const failureCodes = new Set<Ec2RunnerFailureCode>();
  const visited = new Set<Error>();
  let current = error;

  for (let depth = 0; depth < MAX_ERROR_CAUSE_DEPTH && current instanceof Error; depth += 1) {
    if (visited.has(current)) break;
    visited.add(current);
    const awsError = current as AwsErrorLike;
    const errorName = safeFailureIdentifier(awsError.name);
    const errorCode = safeFailureIdentifier(awsError.code);
    if (errorName) failureCodes.add(`aws-name:${errorName}`);
    if (errorCode) failureCodes.add(`aws-code:${errorCode}`);
    if (awsError.$fault === 'client' || awsError.$fault === 'server') {
      failureCodes.add(`aws-fault:${awsError.$fault}`);
    }
    const httpStatusCode = awsError.$metadata?.httpStatusCode;
    if (typeof httpStatusCode === 'number' && Number.isSafeInteger(httpStatusCode) && httpStatusCode >= 0) {
      failureCodes.add(`aws-http:${httpStatusCode}`);
    }
    current = awsError.cause;
  }

  return [...failureCodes];
}

function fleetFailureCodes(errors: FleetError[]): Ec2RunnerFailureCode[] {
  return [
    ...new Set(
      errors.flatMap((error): Ec2RunnerFailureCode[] => {
        const errorCode = safeFailureIdentifier(error.ErrorCode);
        return errorCode ? [`aws-name:${errorCode}`] : [];
      }),
    ),
  ];
}

// The instance_allocation_strategy variable accepts the union of spot and on-demand strategies,
// so a value valid for one capacity type can be invalid for the other. AWS rejects CreateFleet
// when the strategy is not valid for the target capacity type, so fall back to 'lowest-price'
// (the AWS default) when the configured value is invalid for the given capacity type.
function sanitizeAllocationStrategy(
  strategy: string,
  targetCapacityType: string,
): SpotAllocationStrategy | FleetOnDemandAllocationStrategy {
  const validStrategies = targetCapacityType === 'spot' ? SPOT_ALLOCATION_STRATEGIES : ON_DEMAND_ALLOCATION_STRATEGIES;
  return (validStrategies.includes(strategy) ? strategy : 'lowest-price') as
    | SpotAllocationStrategy
    | FleetOnDemandAllocationStrategy;
}

function generateFleetOverrides(
  subnetIds: string[],
  instancesTypes: string[],
  amiId?: string,
  ec2OverrideConfig?: Ec2OverrideConfig,
  allocationStrategy?: string,
  instanceTypePriorities?: Record<string, number>,
): FleetLaunchTemplateOverridesRequest[] {
  const result: FleetLaunchTemplateOverridesRequest[] = [];

  // Use override values if available, otherwise use parameter arrays
  const subnetsToUse = ec2OverrideConfig?.SubnetId ? [ec2OverrideConfig.SubnetId] : subnetIds;
  const instanceTypesToUse = ec2OverrideConfig?.InstanceType ? [ec2OverrideConfig.InstanceType] : instancesTypes;
  const amiIdToUse = ec2OverrideConfig?.ImageId ?? amiId;

  // Both the on-demand 'prioritized' and the spot 'capacity-optimized-prioritized' strategies
  // honor the Priority field of the launch template overrides.
  const usesPriority = allocationStrategy === 'prioritized' || allocationStrategy === 'capacity-optimized-prioritized';

  subnetsToUse.forEach((s) => {
    instanceTypesToUse.forEach((i, index) => {
      const item: FleetLaunchTemplateOverridesRequest = {
        SubnetId: s,
        InstanceType: i as _InstanceType,
        ImageId: amiIdToUse,
        ...(usesPriority && { Priority: instanceTypePriorities?.[i] ?? index }),
        ...ec2OverrideConfig,
      };
      result.push(item);
    });
  });
  return result;
}

// Keep this allow-list explicit so Fleet-only override fields are not sent to RunInstances.
type RunInstancesLaunchOverrides = Pick<
  RunInstancesCommandInput,
  'BlockDeviceMappings' | 'ImageId' | 'InstanceType' | 'Placement' | 'SubnetId'
>;

interface RunInstancesLaunchDefaults {
  imageId?: string;
  instanceType: _InstanceType;
  subnetId: string;
}

function buildRunInstancesOverrides(
  ec2OverrideConfig: Ec2OverrideConfig | undefined,
  defaults: RunInstancesLaunchDefaults,
): RunInstancesLaunchOverrides {
  const imageIdToUse = ec2OverrideConfig?.ImageId ?? defaults.imageId;
  const placement = {
    ...ec2OverrideConfig?.Placement,
  };

  if (!placement.AvailabilityZone && !placement.AvailabilityZoneId) {
    if (ec2OverrideConfig?.AvailabilityZone) {
      placement.AvailabilityZone = ec2OverrideConfig.AvailabilityZone;
    } else if (ec2OverrideConfig?.AvailabilityZoneId) {
      placement.AvailabilityZoneId = ec2OverrideConfig.AvailabilityZoneId;
    }
  }

  const overrides: RunInstancesLaunchOverrides = {
    InstanceType: ec2OverrideConfig?.InstanceType ?? defaults.instanceType,
    SubnetId: ec2OverrideConfig?.SubnetId ?? defaults.subnetId,
  };

  if (imageIdToUse) {
    overrides.ImageId = imageIdToUse;
  }

  if (Object.keys(placement).length > 0) {
    overrides.Placement = placement;
  }

  if (ec2OverrideConfig?.BlockDeviceMappings) {
    overrides.BlockDeviceMappings = ec2OverrideConfig.BlockDeviceMappings.map(
      (blockDeviceMapping): BlockDeviceMapping => ({
        ...blockDeviceMapping,
        ...(blockDeviceMapping.Ebs ? { Ebs: { ...blockDeviceMapping.Ebs } } : {}),
      }),
    );
  }

  return overrides;
}

async function createEc2Runner(
  ec2Client: EC2Client,
  runnerParameters: RunnerInputParameters,
  signal: AbortSignal | undefined,
): Promise<Ec2RunnerCreateResult> {
  logger.debug('Runner configuration.', {
    runner: {
      configuration: {
        ...runnerParameters,
      },
    },
  });

  let amiIdOverride: string | undefined;
  try {
    amiIdOverride = await getAmiIdOverride(runnerParameters);
  } catch (error) {
    throwIfAborted(signal, error);
    const failureCodes = requestFailureCodes(error);
    logger.warn('Runner creation failed before an EC2 request could be made.', {
      failedInstanceCount: runnerParameters.numberOfRunners,
      error: failureMessage(error),
      failureCodes,
    });
    return failedCreateRunnerResult(runnerParameters.numberOfRunners, failureCodes);
  }

  // EC2 Fleet (CreateFleet) does not support launching instances onto dedicated hosts
  // for instance types like mac*.metal. Use RunInstances directly instead.
  if (runnerParameters.useDedicatedHost) {
    logger.info('Using RunInstances for dedicated host placement (CreateFleet does not support dedicated hosts).');
    const result = await createInstancesWithRunInstances(runnerParameters, amiIdOverride, ec2Client, signal);
    logger.info(`Created instance(s) via RunInstances: ${result.instances.join(',')}`);
    return result;
  }

  let fleet: CreateFleetResult;
  try {
    fleet = await createInstances(runnerParameters, amiIdOverride, ec2Client, signal);
  } catch (error) {
    throwIfAborted(signal, error);
    const failureCodes = requestFailureCodes(error);
    logger.warn('Create fleet request failed.', {
      failedInstanceCount: runnerParameters.numberOfRunners,
      error: failureMessage(error),
      failureCodes,
    });
    return failedCreateRunnerResult(runnerParameters.numberOfRunners, failureCodes);
  }

  const result = await processFleetResult(fleet, runnerParameters, ec2Client, signal);

  logger.info(`Created instance(s): ${result.instances.join(',')}`);

  return result;
}

async function processFleetResult(
  fleet: CreateFleetResult,
  runnerParameters: RunnerInputParameters,
  ec2Client: EC2Client,
  signal: AbortSignal | undefined,
): Promise<Ec2RunnerCreateResult> {
  const instances: string[] = fleet.Instances?.flatMap((i) => i.InstanceIds?.flatMap((j) => j) || []) || [];

  if (instances.length === runnerParameters.numberOfRunners) {
    return successfulCreateRunnerResult(instances);
  }

  logger.warn(
    `${
      instances.length === 0 ? 'No' : instances.length + ' off ' + runnerParameters.numberOfRunners
    } instances created.`,
    { data: fleet },
  );

  const errors = fleet.Errors?.flatMap((e) => e.ErrorCode || '') || [];

  if (
    errors.some((e) => runnerParameters.onDemandFailoverOnError?.includes(e)) &&
    runnerParameters.ec2instanceCriteria.targetCapacityType === 'spot'
  ) {
    logger.warn(`Create fleet failed, initatiing fall back to on demand instances.`);
    logger.debug('Create fleet failed.', { data: fleet.Errors });
    const numberOfInstances = runnerParameters.numberOfRunners - instances.length;
    const failoverAllocationStrategy = sanitizeAllocationStrategy(
      runnerParameters.ec2instanceCriteria.instanceAllocationStrategy,
      'on-demand',
    );
    const onDemandResult = await createEc2Runner(
      ec2Client,
      {
        ...runnerParameters,
        numberOfRunners: numberOfInstances,
        onDemandFailoverOnError: ['InsufficientInstanceCapacity'],
        ec2instanceCriteria: {
          ...runnerParameters.ec2instanceCriteria,
          targetCapacityType: 'on-demand',
          instanceAllocationStrategy: failoverAllocationStrategy,
        },
      },
      signal,
    );
    instances.push(...onDemandResult.instances);
    return {
      instances,
      failedInstanceCount: onDemandResult.failedInstanceCount,
      failureCodes: onDemandResult.failureCodes,
    };
  }

  const missingInstanceCount = runnerParameters.numberOfRunners - instances.length;
  const failureCodes = fleetFailureCodes(fleet.Errors || []);

  logger.warn('Create fleet did not create every requested instance.', {
    failedInstanceCount: missingInstanceCount,
    failureCodes,
  });
  return { instances, failedInstanceCount: missingInstanceCount, failureCodes };
}

function processRunInstanceResult(
  result: RunInstancesCommandOutput,
  runnerParameters: RunnerInputParameters,
): Ec2RunnerCreateResult {
  const instances = result.Instances?.map((i) => i.InstanceId!).filter(Boolean) || [];

  if (instances.length === runnerParameters.numberOfRunners) {
    return successfulCreateRunnerResult(instances);
  }

  logger.warn(
    `${
      instances.length === 0 ? 'No' : instances.length + ' off ' + runnerParameters.numberOfRunners
    } instances created.`,
    { data: result },
  );

  const failedInstanceCount = runnerParameters.numberOfRunners - instances.length;
  logger.warn('RunInstances did not create every requested instance.', {
    failedInstanceCount,
  });
  return { instances, failedInstanceCount, failureCodes: [] };
}

function successfulCreateRunnerResult(instances: string[]): Ec2RunnerCreateResult {
  return { instances, failedInstanceCount: 0, failureCodes: [] };
}

function failedCreateRunnerResult(
  failedInstanceCount: number,
  failureCodes: Ec2RunnerFailureCode[] = [],
): Ec2RunnerCreateResult {
  return {
    instances: [],
    failedInstanceCount,
    failureCodes,
  };
}

function throwIfAborted(signal: AbortSignal | undefined, error: unknown): void {
  if (signal?.aborted) signal.throwIfAborted();
  if (error instanceof Error && error.name === 'AbortError') throw error;
}

async function getAmiIdOverride(runnerParameters: RunnerInputParameters): Promise<string | undefined> {
  if (!runnerParameters.amiIdSsmParameterName) {
    return undefined;
  }

  try {
    const amiIdOverride = await getParameter(runnerParameters.amiIdSsmParameterName);
    logger.debug(`AMI override SSM parameter (${runnerParameters.amiIdSsmParameterName}) set to: ${amiIdOverride}`);
    return amiIdOverride;
  } catch (e) {
    logger.debug(
      `Failed to lookup runner AMI ID from SSM parameter: ${runnerParameters.amiIdSsmParameterName}. ` +
        'Please ensure that the given parameter exists on this region and contains a valid runner AMI ID',
      { failureCodes: requestFailureCodes(e) },
    );
    throw e;
  }
}

async function createInstances(
  runnerParameters: RunnerInputParameters,
  amiIdOverride: string | undefined,
  ec2Client: EC2Client,
  signal: AbortSignal | undefined,
) {
  const tags = [
    { Key: 'ghr:Application', Value: 'github-action-runner' },
    { Key: 'ghr:created_by', Value: runnerParameters.source },
    { Key: 'ghr:Type', Value: runnerParameters.runnerType },
    { Key: 'ghr:Owner', Value: runnerParameters.runnerOwner },
  ];
  if (runnerParameters.tracingEnabled) {
    const traceId = tracer.getRootXrayTraceId();
    tags.push({ Key: 'ghr:trace_id', Value: traceId! });
  }

  const targetCapacityType = runnerParameters.ec2instanceCriteria.targetCapacityType;
  const allocationStrategy = sanitizeAllocationStrategy(
    runnerParameters.ec2instanceCriteria.instanceAllocationStrategy,
    targetCapacityType,
  );

  // see for spec https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_CreateFleet.html
  const createFleetCommand = new CreateFleetCommand({
    LaunchTemplateConfigs: [
      {
        LaunchTemplateSpecification: {
          LaunchTemplateName: runnerParameters.launchTemplateName,
          Version: '$Default',
        },
        Overrides: generateFleetOverrides(
          runnerParameters.subnets,
          runnerParameters.ec2instanceCriteria.instanceTypes,
          amiIdOverride,
          runnerParameters.ec2OverrideConfig,
          allocationStrategy,
          runnerParameters.ec2instanceCriteria.instanceTypePriorities,
        ),
      },
    ],
    ...(targetCapacityType === 'spot'
      ? {
          SpotOptions: {
            MaxTotalPrice: runnerParameters.ec2instanceCriteria.maxSpotPrice,
            AllocationStrategy: allocationStrategy as SpotAllocationStrategy,
          },
        }
      : {
          OnDemandOptions: {
            AllocationStrategy: allocationStrategy as FleetOnDemandAllocationStrategy,
          },
        }),
    TargetCapacitySpecification: {
      TotalTargetCapacity: runnerParameters.numberOfRunners,
      DefaultTargetCapacityType: targetCapacityType,
    },
    TagSpecifications: [
      {
        ResourceType: 'instance',
        Tags: tags,
      },
      {
        ResourceType: 'volume',
        Tags: tags,
      },
      {
        ResourceType: 'fleet',
        Tags: tags,
      },
    ],
    Type: 'instant',
  });
  logger.debug('CreateFleet request payload.', { payload: createFleetCommand.input });
  const fleet = await ec2Client.send(createFleetCommand, { abortSignal: signal });
  return fleet;
}

async function createInstancesWithRunInstances(
  runnerParameters: RunnerInputParameters,
  amiIdOverride: string | undefined,
  ec2Client: EC2Client,
  signal: AbortSignal | undefined,
): Promise<Ec2RunnerCreateResult> {
  const tags = [
    { Key: 'ghr:Application', Value: 'github-action-runner' },
    { Key: 'ghr:created_by', Value: runnerParameters.source },
    { Key: 'ghr:Type', Value: runnerParameters.runnerType },
    { Key: 'ghr:Owner', Value: runnerParameters.runnerOwner },
  ];
  if (runnerParameters.tracingEnabled) {
    const traceId = tracer.getRootXrayTraceId();
    tags.push({ Key: 'ghr:trace_id', Value: traceId! });
  }

  if (runnerParameters.ec2instanceCriteria.targetCapacityType === 'spot') {
    logger.warn(
      'Spot instances are not supported with RunInstances. Please set targetCapacityType to on-demand for dedicated hosts.',
    );
    return failedCreateRunnerResult(runnerParameters.numberOfRunners);
  }

  try {
    const runInstancesCommand = new RunInstancesCommand({
      LaunchTemplate: {
        LaunchTemplateName: runnerParameters.launchTemplateName,
        Version: '$Default',
      },
      ...buildRunInstancesOverrides(runnerParameters.ec2OverrideConfig, {
        imageId: amiIdOverride,
        instanceType: runnerParameters.ec2instanceCriteria.instanceTypes[0] as _InstanceType,
        subnetId: runnerParameters.subnets[0],
      }),
      MinCount: runnerParameters.numberOfRunners,
      MaxCount: runnerParameters.numberOfRunners,
      TagSpecifications: [
        {
          ResourceType: 'instance',
          Tags: tags,
        },
        {
          ResourceType: 'volume',
          Tags: tags,
        },
      ],
    });

    logger.debug('RunInstances request payload.', { payload: runInstancesCommand.input });
    const result = await ec2Client.send(runInstancesCommand, { abortSignal: signal });
    return processRunInstanceResult(result, runnerParameters);
  } catch (error) {
    throwIfAborted(signal, error);
    const failureCodes = requestFailureCodes(error);
    logger.warn('RunInstances request failed for dedicated host.', {
      failedInstanceCount: runnerParameters.numberOfRunners,
      error: failureMessage(error),
      failureCodes,
    });
    return failedCreateRunnerResult(runnerParameters.numberOfRunners, failureCodes);
  }
}

// If launchTime is undefined, this will return false
export function bootTimeExceeded(ec2Runner: { launchTime?: Date }): boolean {
  const runnerBootTimeInMinutes = process.env.RUNNER_BOOT_TIME_IN_MINUTES;
  const launchTimePlusBootTime = moment(ec2Runner.launchTime).utc().add(runnerBootTimeInMinutes, 'minutes');
  return launchTimePlusBootTime < moment(new Date()).utc();
}
