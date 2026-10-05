import {
  CancelSpotInstanceRequestsCommand,
  DescribeInstancesCommand,
  DescribeLaunchTemplateVersionsCommand,
  DescribeSpotInstanceRequestsCommand,
  type EC2Client,
  type Filter,
  type Instance,
  RunInstancesCommand,
  type RunInstancesCommandInput,
  type SpotInstanceRequest,
  StartInstancesCommand,
  type Tag,
  TerminateInstancesCommand,
  type _InstanceType,
} from '@aws-sdk/client-ec2';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { getParameter } from '@aws-github-runner/aws-ssm-util';

import type {
  DestroyStandbyInput,
  ListStandbyInput,
  RunnerInfo,
  StandbyImage,
  StandbyInstance,
  StandbyInstanceState,
  StandbyListing,
  StandbySpotRequest,
} from '../../../core';
import type { Ec2RunnerCreateResult, Ec2RunnerFailureCode } from './runner-create-result';
import {
  awsErrorCode,
  createRunnerTags,
  type Ec2RunnerRequestContext,
  failureDetails,
  getAmiIdOverride,
  toRunnerInfo,
  requestFailureCodes,
  runWithRequestSignal,
  throwIfAborted,
} from './runners';
import type { RunnerInputParameters } from './runners.d';

const logger = createChildLogger('standby');

export const WARM_POOL_TAG = 'ghr:warm-pool';
export const WARM_ACTIVATED_TAG = 'ghr:warm-activated';
export const WARM_EXPIRES_AT_TAG = 'ghr:warm-expires-at';
export const LAUNCH_TEMPLATE_VERSION_TAG = 'aws:ec2launchtemplate:version';
// Extra lifetime beyond max age for `ghr:warm-expires-at` and the spot request `ValidUntil`.
export const WARM_EXPIRY_MARGIN_HOURS = 24;

export const WARM_LAUNCH_FALLBACK_ERRORS: ReadonlySet<string> = new Set([
  'InsufficientCapacity',
  'InsufficientCapacityOnHost',
  'InsufficientFreeAddressesInSubnet',
  'InsufficientHostCapacity',
  'InsufficientInstanceCapacity',
  'MaxSpotInstanceCountExceeded',
  'SpotMaxPriceTooLow',
  'UnfulfillableCapacity',
  'Unsupported',
]);

const INSTANCE_INITIATED_SHUTDOWN = 'Client.InstanceInitiatedShutdown';
const RESOLVE_SSM_PREFIX = 'resolve:ssm:';
// The request status lags the instance stop by up to a minute, so only AWS-driven codes disqualify.
const SPOT_STOPPED_BY_AWS = new Set([
  'instance-stopped-by-price',
  'instance-stopped-no-capacity',
  'marked-for-stop',
  'marked-for-termination',
]);
const SPOT_REQUEST_NOT_FOUND = 'InvalidSpotInstanceRequestID.NotFound';
const PRIMING_EC2_STATES = new Set(['pending', 'running', 'stopping']);
const LIVE_EC2_STATES = ['pending', 'running', 'stopping', 'stopped'];
const GONE_EC2_STATES = ['shutting-down', 'terminated'];
const LIVE_SPOT_REQUEST_STATES = ['open', 'active', 'disabled'];
const HOUR_IN_MS = 60 * 60 * 1000;
// Matches the activation lease TTL; a younger activation may still be starting its instance.
export const WARM_ACTIVATION_GRACE_MS = 10 * 60 * 1000;

export type Ec2WarmLaunchParameters = Pick<
  RunnerInputParameters,
  | 'environment'
  | 'runnerType'
  | 'runnerOwner'
  | 'subnets'
  | 'launchTemplateName'
  | 'ec2instanceCriteria'
  | 'numberOfRunners'
  | 'source'
  | 'amiIdSsmParameterName'
  | 'tracingEnabled'
> & { maxAgeHours: number };

export type Ec2CurrentImageParameters = Partial<
  Pick<RunnerInputParameters, 'launchTemplateName' | 'amiIdSsmParameterName'>
>;

export interface StandbyClassificationInput {
  ec2State?: string;
  stateReasonCode?: string;
  spot: boolean;
  spotStatusCode?: string;
  spotRequestState?: string;
  activated: boolean;
}

export interface Ec2StoppedWarmInstance {
  instanceId: string;
  spotInstanceRequestId?: string;
  expiresAt?: string;
  activated: boolean;
  /** Value of `ghr:warm-activated`, the ISO-8601 activation time. */
  activatedAt?: string;
}

/** A warm-pool instance as recorded in the warm pool index. */
export interface Ec2IndexedInstance {
  instanceId: string;
  spotInstanceRequestId?: string;
  /** ISO-8601 activation time recorded by scale-up. */
  activatedAt?: string;
}

export interface Ec2ScaleDownListing {
  /** Running and pending runners, as the runner listing returns them. */
  runners: RunnerInfo[];
  stoppedWarm: Ec2StoppedWarmInstance[];
}

export interface Ec2StandbyRead extends StandbyListing {
  /** Indexed instances whose entry can be dropped: gone without a live spot request, or activated and settled. */
  releasedInstanceIds: string[];
}

export interface Ec2StandbyOperations {
  destroyInstance(input: DestroyStandbyInput): Promise<void>;
  launchWarm(parameters: Ec2WarmLaunchParameters): Promise<Ec2RunnerCreateResult>;
  /** Tag-filtered scan, classified from EC2 data only; slow with many matching instances. */
  listStandby(filters: ListStandbyInput): Promise<StandbyInstance[]>;
  /** Reads exactly the indexed instances by ID, with one by-ID spot request lookup. */
  readStandby(indexed: Ec2IndexedInstance[]): Promise<Ec2StandbyRead>;
  listStoppedWarmInstances(environment: string): Promise<Ec2StoppedWarmInstance[]>;
  /** One listing for scale-down: its runners and the stopped warm instances to sweep. */
  listScaleDownInstances(environment: string): Promise<Ec2ScaleDownListing>;
  cancelSpotRequest(spotInstanceRequestId: string): Promise<void>;
  currentImage(parameters: Ec2CurrentImageParameters): Promise<StandbyImage>;
  startInstance(instanceId: string): Promise<void>;
}

export interface Ec2StandbyClient {
  forRequest(context: Ec2RunnerRequestContext): Ec2StandbyOperations;
}

export function createEc2StandbyClient(ec2Client: EC2Client): Ec2StandbyClient {
  return {
    forRequest: ({ signal }) => ({
      destroyInstance: (input) => runWithRequestSignal(signal, () => destroyInstance(ec2Client, input, signal)),
      launchWarm: (parameters) =>
        runWithRequestSignal(signal, () => launchWarmInstances(ec2Client, parameters, signal)),
      listStandby: (filters) => runWithRequestSignal(signal, () => listStandbyInstances(ec2Client, filters, signal)),
      readStandby: (indexed) => runWithRequestSignal(signal, () => readStandbyInstances(ec2Client, indexed, signal)),
      listStoppedWarmInstances: (environment) =>
        runWithRequestSignal(signal, () => listStoppedWarmInstances(ec2Client, environment, signal)),
      listScaleDownInstances: (environment) =>
        runWithRequestSignal(signal, () => listScaleDownInstances(ec2Client, environment, signal)),
      cancelSpotRequest: (spotInstanceRequestId) =>
        runWithRequestSignal(signal, () => cancelSpotRequest(ec2Client, spotInstanceRequestId, signal)),
      currentImage: (parameters) => runWithRequestSignal(signal, () => currentImage(ec2Client, parameters, signal)),
      startInstance: (instanceId) =>
        runWithRequestSignal(signal, async () => {
          await ec2Client.send(new StartInstancesCommand({ InstanceIds: [instanceId] }), { abortSignal: signal });
        }),
    }),
  };
}

export function classifyStandbyInstance(input: StandbyClassificationInput): StandbyInstanceState {
  if (input.activated) return 'ACTIVE';
  if (input.ec2State === 'stopped') {
    // A stopped spot instance whose request is cancelled or closed (e.g. past ValidUntil) can never be started.
    const requestUsable =
      input.spotRequestState === undefined || LIVE_SPOT_REQUEST_STATES.includes(input.spotRequestState);
    const selfStopped =
      input.stateReasonCode === INSTANCE_INITIATED_SHUTDOWN &&
      !(input.spot && input.spotStatusCode !== undefined && SPOT_STOPPED_BY_AWS.has(input.spotStatusCode)) &&
      (!input.spot || requestUsable);
    return selfStopped ? 'WARM' : 'GARBAGE';
  }
  return input.ec2State !== undefined && PRIMING_EC2_STATES.has(input.ec2State) ? 'PRIMING' : 'GARBAGE';
}

async function destroyInstance(
  ec2Client: EC2Client,
  input: DestroyStandbyInput,
  signal: AbortSignal | undefined,
): Promise<void> {
  const spotInstanceRequestId =
    input.spotInstanceRequestId ?? (await lookupSpotInstanceRequestId(ec2Client, input.instanceId, signal));
  // Terminating before cancelling re-opens a persistent request and AWS launches a replacement.
  if (spotInstanceRequestId) {
    await cancelSpotRequest(ec2Client, spotInstanceRequestId, signal);
  }
  logger.info(`Terminating standby instance '${input.instanceId}'.`, { spotInstanceRequestId });
  await ec2Client.send(new TerminateInstancesCommand({ InstanceIds: [input.instanceId] }), { abortSignal: signal });
}

async function lookupSpotInstanceRequestId(
  ec2Client: EC2Client,
  instanceId: string,
  signal: AbortSignal | undefined,
): Promise<string | undefined> {
  const result = await ec2Client.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }), {
    abortSignal: signal,
  });
  return result.Reservations?.flatMap((reservation) => reservation.Instances ?? []).find(
    (instance) => instance.InstanceId === instanceId,
  )?.SpotInstanceRequestId;
}

async function cancelSpotRequest(
  ec2Client: EC2Client,
  spotInstanceRequestId: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  try {
    await ec2Client.send(new CancelSpotInstanceRequestsCommand({ SpotInstanceRequestIds: [spotInstanceRequestId] }), {
      abortSignal: signal,
    });
    logger.info(`Cancelled spot instance request '${spotInstanceRequestId}'.`);
  } catch (error) {
    if (awsErrorCode(error) === SPOT_REQUEST_NOT_FOUND) {
      logger.info(`Spot instance request '${spotInstanceRequestId}' no longer exists.`);
      return;
    }
    throw error;
  }
}

async function currentImage(
  ec2Client: EC2Client,
  parameters: Ec2CurrentImageParameters,
  signal: AbortSignal | undefined,
): Promise<StandbyImage> {
  const template = await lookupOrUndefined('launch template default version', signal, async () => {
    if (!parameters.launchTemplateName) return undefined;
    const result = await ec2Client.send(
      new DescribeLaunchTemplateVersionsCommand({
        LaunchTemplateName: parameters.launchTemplateName,
        Versions: ['$Default'],
      }),
      { abortSignal: signal },
    );
    return result.LaunchTemplateVersions?.[0];
  });
  const imageId = await lookupOrUndefined('AMI id', signal, async () => {
    if (parameters.amiIdSsmParameterName) return getAmiIdOverride(parameters);
    const templateImage = template?.LaunchTemplateData?.ImageId;
    // EC2 resolves `resolve:ssm:<parameter>` at launch, so compare against the parameter's current value.
    return templateImage?.startsWith(RESOLVE_SSM_PREFIX)
      ? getParameter(templateImage.slice(RESOLVE_SSM_PREFIX.length))
      : templateImage;
  });
  return { imageId, launchTemplateVersion: template?.VersionNumber?.toString() };
}

async function lookupOrUndefined<TValue>(
  description: string,
  signal: AbortSignal | undefined,
  lookup: () => Promise<TValue | undefined>,
): Promise<TValue | undefined> {
  try {
    return await lookup();
  } catch (error) {
    throwIfAborted(signal, error);
    logger.warn(`Unable to determine the current ${description}, skipping that drift check.`, failureDetails(error));
    return undefined;
  }
}

async function launchWarmInstances(
  ec2Client: EC2Client,
  parameters: Ec2WarmLaunchParameters,
  signal: AbortSignal | undefined,
): Promise<Ec2RunnerCreateResult> {
  let amiId: string | undefined;
  try {
    amiId = await getAmiIdOverride(parameters);
  } catch (error) {
    throwIfAborted(signal, error);
    const failureCodes = requestFailureCodes(error);
    logger.warn('Warm launch failed before an EC2 request could be made.', { ...failureDetails(error), failureCodes });
    return { instances: [], failedInstanceCount: parameters.numberOfRunners, failureCodes };
  }

  const expiresAt = new Date(Date.now() + (parameters.maxAgeHours + WARM_EXPIRY_MARGIN_HOURS) * HOUR_IN_MS);
  const tags: Tag[] = [
    // Activation tags the trace of the scale-up that assigns the job, not the pool refill.
    ...createRunnerTags({ ...parameters, tracingEnabled: false }),
    { Key: WARM_POOL_TAG, Value: 'true' },
    { Key: WARM_EXPIRES_AT_TAG, Value: expiresAt.toISOString() },
  ];

  const instances: string[] = [];
  const failureCodes = new Set<Ec2RunnerFailureCode>();
  for (const instanceType of parameters.ec2instanceCriteria.instanceTypes) {
    for (const subnetId of parameters.subnets) {
      const remaining = parameters.numberOfRunners - instances.length;
      if (remaining <= 0) break;
      try {
        const result = await ec2Client.send(
          new RunInstancesCommand(
            buildWarmRunInstancesInput(parameters, { amiId, expiresAt, instanceType, subnetId, tags, remaining }),
          ),
          { abortSignal: signal },
        );
        instances.push(...(result.Instances?.flatMap((instance) => instance.InstanceId ?? []) ?? []));
      } catch (error) {
        throwIfAborted(signal, error);
        requestFailureCodes(error).forEach((failureCode) => failureCodes.add(failureCode));
        if (!WARM_LAUNCH_FALLBACK_ERRORS.has(awsErrorCode(error) ?? '')) {
          logger.warn('Warm launch failed with a non-capacity error.', {
            instanceType,
            subnetId,
            ...failureDetails(error),
          });
          return warmLaunchResult(parameters, instances, failureCodes);
        }
        logger.info('Warm launch capacity error, trying next instance type and subnet.', {
          instanceType,
          subnetId,
          ...failureDetails(error),
        });
      }
    }
  }
  return warmLaunchResult(parameters, instances, failureCodes);
}

function warmLaunchResult(
  parameters: Ec2WarmLaunchParameters,
  instances: string[],
  failureCodes: Set<Ec2RunnerFailureCode>,
): Ec2RunnerCreateResult {
  const failedInstanceCount = Math.max(parameters.numberOfRunners - instances.length, 0);
  if (instances.length > 0) logger.info(`Launched warm instance(s): ${instances.join(',')}`);
  if (failedInstanceCount > 0) {
    logger.warn('Warm launch did not create every requested instance.', {
      failedInstanceCount,
      failureCodes: [...failureCodes],
    });
  }
  return { instances, failedInstanceCount, failureCodes: failedInstanceCount > 0 ? [...failureCodes] : [] };
}

function buildWarmRunInstancesInput(
  parameters: Ec2WarmLaunchParameters,
  launch: {
    amiId?: string;
    expiresAt: Date;
    instanceType: string;
    subnetId: string;
    tags: Tag[];
    remaining: number;
  },
): RunInstancesCommandInput {
  const spot = parameters.ec2instanceCriteria.targetCapacityType === 'spot';
  const maxSpotPrice = parameters.ec2instanceCriteria.maxSpotPrice;
  return {
    LaunchTemplate: {
      LaunchTemplateName: parameters.launchTemplateName,
      Version: '$Default',
    },
    InstanceType: launch.instanceType as _InstanceType,
    SubnetId: launch.subnetId,
    ...(launch.amiId ? { ImageId: launch.amiId } : {}),
    MinCount: 1,
    MaxCount: launch.remaining,
    InstanceInitiatedShutdownBehavior: 'stop',
    ...(spot
      ? {
          InstanceMarketOptions: {
            MarketType: 'spot',
            SpotOptions: {
              SpotInstanceType: 'persistent',
              InstanceInterruptionBehavior: 'stop',
              ValidUntil: launch.expiresAt,
              ...(maxSpotPrice ? { MaxPrice: maxSpotPrice } : {}),
            },
          },
        }
      : {}),
    TagSpecifications: [
      { ResourceType: 'instance', Tags: launch.tags },
      { ResourceType: 'volume', Tags: launch.tags },
      ...(spot ? [{ ResourceType: 'spot-instances-request' as const, Tags: launch.tags }] : []),
    ],
  };
}

function standbyTagFilters(filters: ListStandbyInput): Filter[] {
  return [
    { Name: 'tag:ghr:Application', Values: ['github-action-runner'] },
    { Name: 'tag:ghr:environment', Values: [filters.environment] },
    { Name: 'tag:ghr:Type', Values: [filters.runnerType] },
    { Name: 'tag:ghr:Owner', Values: [filters.runnerOwner] },
    { Name: `tag:${WARM_POOL_TAG}`, Values: ['true'] },
  ];
}

async function describeInstances(
  ec2Client: EC2Client,
  filters: Filter[],
  signal: AbortSignal | undefined,
): Promise<Instance[]> {
  const instances: Instance[] = [];
  let nextToken: string | undefined;
  do {
    const result = await ec2Client.send(new DescribeInstancesCommand({ Filters: filters, NextToken: nextToken }), {
      abortSignal: signal,
    });
    instances.push(...(result.Reservations?.flatMap((reservation) => reservation.Instances ?? []) ?? []));
    nextToken = result.NextToken;
  } while (nextToken);
  return instances;
}

const ID_READ_CHUNK = 200;

function errorText(error: unknown): string {
  const nested = (error as { Error?: { Message?: string } } | undefined)?.Error?.Message;
  return [error instanceof Error ? error.message : String(error), nested].filter(Boolean).join(' ');
}

// One unknown ID fails the whole call, so drop the IDs named in the error and read the rest again.
async function describeById<TResult>(
  ids: string[],
  notFoundCode: string,
  idPattern: RegExp,
  describe: (ids: string[]) => Promise<TResult[]>,
): Promise<{ results: TResult[]; missing: string[] }> {
  const results: TResult[] = [];
  const missing: string[] = [];
  for (let offset = 0; offset < ids.length; offset += ID_READ_CHUNK) {
    let remaining = ids.slice(offset, offset + ID_READ_CHUNK);
    while (remaining.length > 0) {
      try {
        results.push(...(await describe(remaining)));
        break;
      } catch (error) {
        if (awsErrorCode(error) !== notFoundCode) throw error;
        const named = new Set(errorText(error).match(idPattern) ?? []);
        const gone = remaining.filter((id) => named.has(id));
        if (gone.length === 0) throw error;
        missing.push(...gone);
        remaining = remaining.filter((id) => !named.has(id));
      }
    }
  }
  return { results, missing };
}

async function describeInstancesById(
  ec2Client: EC2Client,
  instanceIds: string[],
  signal: AbortSignal | undefined,
): Promise<Instance[]> {
  const { results } = await describeById(instanceIds, 'InvalidInstanceID.NotFound', /i-[0-9a-z]+/g, async (ids) => {
    const result = await ec2Client.send(new DescribeInstancesCommand({ InstanceIds: ids }), { abortSignal: signal });
    return result.Reservations?.flatMap((reservation) => reservation.Instances ?? []) ?? [];
  });
  return results;
}

async function describeSpotRequestsById(
  ec2Client: EC2Client,
  spotInstanceRequestIds: string[],
  signal: AbortSignal | undefined,
): Promise<SpotInstanceRequest[]> {
  const { results } = await describeById(
    spotInstanceRequestIds,
    'InvalidSpotInstanceRequestID.NotFound',
    /sir-[0-9a-z]+/g,
    async (ids) => {
      const result = await ec2Client.send(new DescribeSpotInstanceRequestsCommand({ SpotInstanceRequestIds: ids }), {
        abortSignal: signal,
      });
      return result.SpotInstanceRequests ?? [];
    },
  );
  return results;
}

function tagValue(instance: Instance | undefined, key: string): string | undefined {
  return instance?.Tags?.find((tag) => tag.Key === key)?.Value;
}

function toStandbyInstance(instance: Instance, request: SpotInstanceRequest | undefined): StandbyInstance {
  return {
    instanceId: instance.InstanceId as string,
    state: classifyStandbyInstance({
      ec2State: instance.State?.Name,
      stateReasonCode: instance.StateReason?.Code,
      spot: instance.SpotInstanceRequestId !== undefined,
      spotStatusCode: request?.Status?.Code,
      spotRequestState: request?.State,
      activated: tagValue(instance, WARM_ACTIVATED_TAG) !== undefined,
    }),
    launchTime: instance.LaunchTime,
    imageId: instance.ImageId,
    launchTemplateVersion: tagValue(instance, LAUNCH_TEMPLATE_VERSION_TAG),
    instanceType: instance.InstanceType,
    availabilityZone: instance.Placement?.AvailabilityZone,
    spotInstanceRequestId: instance.SpotInstanceRequestId,
    expiresAt: tagValue(instance, WARM_EXPIRES_AT_TAG),
  };
}

async function listStandbyInstances(
  ec2Client: EC2Client,
  filters: ListStandbyInput,
  signal: AbortSignal | undefined,
): Promise<StandbyInstance[]> {
  const instances = await describeInstances(
    ec2Client,
    [{ Name: 'instance-state-name', Values: LIVE_EC2_STATES }, ...standbyTagFilters(filters)],
    signal,
  );
  return instances.map((instance) => toStandbyInstance(instance, undefined));
}

function settledActivation(activatedAt: string | undefined, now: number): boolean {
  const time = Date.parse(activatedAt ?? '');
  return !Number.isNaN(time) && now - time >= WARM_ACTIVATION_GRACE_MS;
}

async function readStandbyInstances(
  ec2Client: EC2Client,
  indexed: Ec2IndexedInstance[],
  signal: AbortSignal | undefined,
): Promise<Ec2StandbyRead> {
  const found = new Map(
    (
      await describeInstancesById(
        ec2Client,
        indexed.map(({ instanceId }) => instanceId),
        signal,
      )
    ).map((instance) => [instance.InstanceId, instance]),
  );
  const now = Date.now();
  const entries = indexed.map((item) => {
    const instance = found.get(item.instanceId);
    const activatedAt = tagValue(instance, WARM_ACTIVATED_TAG) ?? item.activatedAt;
    return {
      instanceId: item.instanceId,
      instance,
      gone: instance === undefined || GONE_EC2_STATES.includes(instance.State?.Name ?? ''),
      activatedAt,
      settled: settledActivation(activatedAt, now),
      spotInstanceRequestId: instance?.SpotInstanceRequestId ?? item.spotInstanceRequestId,
    };
  });
  // Live, unactivated instances are classified; gone or settled activated ones are cleaned up.
  const finished = entries.filter((entry) => entry.gone || (entry.activatedAt !== undefined && entry.settled));
  const classified = entries.filter((entry) => !entry.gone && entry.activatedAt === undefined);

  const spotInstanceRequestIds = [
    ...new Set(
      [...finished, ...classified.filter((entry) => entry.instance?.State?.Name === 'stopped')].flatMap(
        (entry) => entry.spotInstanceRequestId ?? [],
      ),
    ),
  ];
  let spotRequestById = new Map<string, SpotInstanceRequest>();
  let spotStateKnown = true;
  if (spotInstanceRequestIds.length > 0) {
    try {
      const requests = await describeSpotRequestsById(ec2Client, spotInstanceRequestIds, signal);
      spotRequestById = new Map(
        requests.flatMap((request) =>
          request.SpotInstanceRequestId ? [[request.SpotInstanceRequestId, request]] : [],
        ),
      );
    } catch (error) {
      throwIfAborted(signal, error);
      logger.warn(
        'Unable to read spot request state, classifying stopped spot instances from EC2 data and skipping spot request cleanup.',
        failureDetails(error),
      );
      spotStateKnown = false;
    }
  }
  const spotRequest = (id: string | undefined) => (id === undefined ? undefined : spotRequestById.get(id));

  const orphanedSpotRequests: StandbySpotRequest[] = [];
  const releasedInstanceIds: string[] = [];
  for (const entry of finished) {
    if (!entry.spotInstanceRequestId) {
      releasedInstanceIds.push(entry.instanceId);
      continue;
    }
    if (!spotStateKnown) continue;
    const request = spotRequest(entry.spotInstanceRequestId);
    if (!request || !LIVE_SPOT_REQUEST_STATES.includes(request.State ?? '')) {
      releasedInstanceIds.push(entry.instanceId);
      continue;
    }
    const replacementInstanceId =
      request.InstanceId !== undefined && request.InstanceId !== entry.instanceId ? request.InstanceId : undefined;
    orphanedSpotRequests.push({
      spotInstanceRequestId: entry.spotInstanceRequestId,
      state: request.State,
      instanceId: entry.instanceId,
      ...(replacementInstanceId ? { replacementInstanceId } : {}),
    });
  }

  return {
    instances: classified.map((entry) =>
      toStandbyInstance(entry.instance as Instance, spotRequest(entry.spotInstanceRequestId)),
    ),
    orphanedSpotRequests,
    spotStateKnown,
    releasedInstanceIds,
  };
}

function toStoppedWarmInstance(instance: Instance): Ec2StoppedWarmInstance[] {
  if (!instance.InstanceId) return [];
  return [
    {
      instanceId: instance.InstanceId,
      spotInstanceRequestId: instance.SpotInstanceRequestId,
      expiresAt: tagValue(instance, WARM_EXPIRES_AT_TAG),
      activated: tagValue(instance, WARM_ACTIVATED_TAG) !== undefined,
      activatedAt: tagValue(instance, WARM_ACTIVATED_TAG),
    },
  ];
}

async function listStoppedWarmInstances(
  ec2Client: EC2Client,
  environment: string,
  signal: AbortSignal | undefined,
): Promise<Ec2StoppedWarmInstance[]> {
  const instances = await describeInstances(
    ec2Client,
    [
      { Name: 'instance-state-name', Values: ['stopped'] },
      { Name: 'tag:ghr:Application', Values: ['github-action-runner'] },
      { Name: 'tag:ghr:environment', Values: [environment] },
      { Name: `tag:${WARM_POOL_TAG}`, Values: ['true'] },
    ],
    signal,
  );
  return instances.flatMap(toStoppedWarmInstance);
}

async function listScaleDownInstances(
  ec2Client: EC2Client,
  environment: string,
  signal: AbortSignal | undefined,
): Promise<Ec2ScaleDownListing> {
  const instances = await describeInstances(
    ec2Client,
    [
      { Name: 'instance-state-name', Values: ['running', 'pending', 'stopped'] },
      { Name: 'tag:ghr:environment', Values: [environment] },
      { Name: 'tag:ghr:Application', Values: ['github-action-runner'] },
    ],
    signal,
  );
  const stopped = (instance: Instance) => instance.State?.Name === 'stopped';
  return {
    runners: instances.filter((instance) => !stopped(instance)).map(toRunnerInfo),
    stoppedWarm: instances
      .filter((instance) => stopped(instance) && tagValue(instance, WARM_POOL_TAG) === 'true')
      .flatMap(toStoppedWarmInstance),
  };
}
