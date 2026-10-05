import { createChildLogger, createSingleMetric, tracer } from '@aws-github-runner/aws-powertools-util';
import type { RunnerConfigStorage } from '@aws-github-runner/storage-providers';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import type { Tag } from '@aws-sdk/client-ec2';
import type { Octokit } from '@octokit/rest';
import yn from 'yn';

import type {
  CreateGitHubRunnerConfig,
  CreateStartRunnerConfig,
  ListStandbyInput,
  StandbyInstance,
} from '../../../../core';
import { awsErrorCode, type Ec2RunnerResourceOperations, failureDetails } from '../runners';
import { type Ec2StandbyOperations, WARM_ACTIVATED_TAG, WARM_ACTIVATION_GRACE_MS } from '../standby';
import type { WarmIndexItem, WarmIndexStore } from '../warm-index';
import type { CreateWarmIndexStore } from './pool';
import { createEc2StartRunnerConfigOptions } from './runner-creation';

const logger = createChildLogger('ec2-warm-activation');
const SPOT_CANCEL_ATTEMPTS = 3;
const TRACE_ID_TAG = 'ghr:trace_id';
// The index entry no longer matches EC2; another warm instance may still start.
const STALE_START_ERRORS = new Set([
  'InvalidInstanceID.NotFound',
  'IncorrectInstanceState',
  'IncorrectSpotRequestState',
]);

export type WarmActivationFallbackReason = 'no-warm-instance' | 'claim-lost' | 'index-unavailable' | 'start-failed';

export interface Ec2WarmActivationOperations {
  standby: Pick<Ec2StandbyOperations, 'startInstance' | 'cancelSpotRequest'>;
  createIndexStore: CreateWarmIndexStore;
}

export interface WarmActivationInput {
  githubRunnerConfig: CreateGitHubRunnerConfig;
  numberOfRunners: number;
  ghClient: Octokit;
  storage: RunnerConfigStorage;
}

export interface WarmActivationResult {
  instances: string[];
  retryableErrorCount: number;
  /** Slots that were not activated from the warm pool and must be launched cold. */
  coldRunnerCount: number;
}

interface ActivationContext {
  ec2Operations: Ec2RunnerResourceOperations;
  warmOperations: Ec2WarmActivationOperations;
  index: WarmIndexStore;
  pool: ListStandbyInput;
  storage: RunnerConfigStorage;
}

interface BatchOutcome {
  started: string[];
  retryableErrorCount: number;
  /** Instances that failed for a reason another warm instance would not fix; launched cold. */
  coldFallbacks: number;
  staleCount: number;
}

type FallBack = (reason: WarmActivationFallbackReason, count: number) => void;

export function isWarmActivationEnabled(): boolean {
  return yn(process.env.WARM_POOL_ENABLED, { default: false });
}

export async function activateWarmRunners(
  ec2Operations: Ec2RunnerResourceOperations,
  warmOperations: Ec2WarmActivationOperations,
  createStartRunnerConfig: CreateStartRunnerConfig,
  input: WarmActivationInput,
): Promise<WarmActivationResult> {
  const environment = process.env.ENVIRONMENT;
  const pool: ListStandbyInput = {
    environment,
    runnerOwner: environment,
    runnerType: 'Org',
  };
  const fallbacks = new Map<WarmActivationFallbackReason, number>();
  const fallBack: FallBack = (reason, count) => {
    if (count > 0) fallbacks.set(reason, (fallbacks.get(reason) ?? 0) + count);
  };
  const finish = (instances: string[], retryableErrorCount: number): WarmActivationResult => {
    if (instances.length > 0) logger.info(`Activated warm instance(s): ${instances.join(',')}`);
    if (fallbacks.size > 0) logger.info('Some runners fall back to a cold launch.', Object.fromEntries(fallbacks));
    publishActivationMetrics(environment, instances.length, fallbacks);
    return {
      instances,
      retryableErrorCount,
      coldRunnerCount: input.numberOfRunners - instances.length - retryableErrorCount,
    };
  };

  const tableName = process.env.WARM_POOL_INDEX_TABLE_NAME;
  if (!tableName) {
    logger.warn('WARM_POOL_INDEX_TABLE_NAME is not set, skipping warm activation.');
    fallBack('index-unavailable', input.numberOfRunners);
    return finish([], 0);
  }
  const index = warmOperations.createIndexStore(tableName, environment);
  let candidates: StandbyInstance[];
  try {
    candidates = warmCandidates(await index.query());
  } catch (error) {
    logger.warn('Warm pool index is unavailable, skipping warm activation.', failureDetails(error));
    fallBack('index-unavailable', input.numberOfRunners);
    return finish([], 0);
  }

  const context: ActivationContext = { ec2Operations, warmOperations, index, pool, storage: input.storage };
  const instances: string[] = [];
  let retryableErrorCount = 0;
  let needed = input.numberOfRunners;
  let claimLost = false;
  let staleCount = 0;
  while (needed > 0 && candidates.length > 0) {
    const claim = await claimWarmInstances(index, candidates, needed);
    candidates = claim.remaining;
    claimLost ||= claim.lost;
    if (claim.unavailable) {
      fallBack('index-unavailable', needed);
      return finish(instances, retryableErrorCount);
    }
    if (claim.claimed.length === 0) break;

    const outcome = await activateBatch(context, createStartRunnerConfig, input, claim.claimed);
    instances.push(...outcome.started);
    retryableErrorCount += outcome.retryableErrorCount;
    fallBack('start-failed', outcome.coldFallbacks);
    staleCount += outcome.staleCount;
    needed -= outcome.started.length + outcome.retryableErrorCount + outcome.coldFallbacks;
  }
  const staleFallbacks = Math.min(needed, staleCount);
  fallBack('start-failed', staleFallbacks);
  fallBack(claimLost ? 'claim-lost' : 'no-warm-instance', needed - staleFallbacks);
  return finish(instances, retryableErrorCount);
}

function warmCandidates(items: WarmIndexItem[]): StandbyInstance[] {
  const now = Date.now();
  // Scale-down sweeps expired standby instances, so never activate one that expires during activation.
  const claimableUntil = now + WARM_ACTIVATION_GRACE_MS;
  const launchedAt = (item: WarmIndexItem) => Date.parse(item.launchTime ?? '') || 0;
  return items
    .filter((item) => item.state === 'WARM')
    .filter((item) => item.claimUntil === undefined || item.claimUntil * 1000 < now)
    .filter((item) => {
      const expiresAt = Date.parse(item.expiresAt ?? '');
      return Number.isNaN(expiresAt) || expiresAt > claimableUntil;
    })
    .sort((a, b) => launchedAt(b) - launchedAt(a))
    .map((item) => ({
      instanceId: item.instanceId,
      state: 'WARM',
      launchTime: item.launchTime ? new Date(item.launchTime) : undefined,
      expiresAt: item.expiresAt,
      spotInstanceRequestId: item.spotInstanceRequestId,
    }));
}

async function claimWarmInstances(
  index: WarmIndexStore,
  candidates: StandbyInstance[],
  count: number,
): Promise<{ claimed: StandbyInstance[]; remaining: StandbyInstance[]; lost: boolean; unavailable: boolean }> {
  const claimed: StandbyInstance[] = [];
  let lost = false;
  let tried = 0;
  for (const candidate of candidates) {
    if (claimed.length === count) break;
    tried++;
    try {
      if (await index.claim(candidate.instanceId)) {
        claimed.push(candidate);
      } else {
        lost = true;
        logger.debug(`Warm instance '${candidate.instanceId}' is claimed by another invocation.`);
      }
    } catch (error) {
      logger.warn('Warm pool index is unavailable, skipping warm activation.', failureDetails(error));
      for (const instance of claimed) await releaseClaim(index, instance.instanceId);
      return { claimed: [], remaining: [], lost, unavailable: true };
    }
  }
  return { claimed, remaining: candidates.slice(tried), lost, unavailable: false };
}

async function activateBatch(
  context: ActivationContext,
  createStartRunnerConfig: CreateStartRunnerConfig,
  input: WarmActivationInput,
  claimed: StandbyInstance[],
): Promise<BatchOutcome> {
  const outcome: BatchOutcome = { started: [], retryableErrorCount: 0, coldFallbacks: 0, staleCount: 0 };
  const activatedAt = new Date().toISOString();

  const tagged: StandbyInstance[] = [];
  for (const instance of claimed) {
    try {
      await context.ec2Operations.tag(instance.instanceId, activationTags(input.githubRunnerConfig, activatedAt));
      tagged.push(instance);
    } catch (error) {
      logger.warn(`Failed to tag warm instance '${instance.instanceId}' for activation.`, failureDetails(error));
      await rollbackActivation(context, instance.instanceId);
      outcome.coldFallbacks++;
    }
  }

  const failedConfig = await createRunnerConfig(context, createStartRunnerConfig, input, tagged);
  for (const instanceId of failedConfig) await rollbackActivation(context, instanceId);
  outcome.retryableErrorCount = failedConfig.length;

  for (const instance of tagged.filter(({ instanceId }) => !failedConfig.includes(instanceId))) {
    try {
      await context.warmOperations.standby.startInstance(instance.instanceId);
    } catch (error) {
      const stale = STALE_START_ERRORS.has(awsErrorCode(error) ?? '');
      logger.warn(
        `Failed to start warm instance '${instance.instanceId}', ${stale ? 'trying another warm instance' : 'falling back to a cold launch'}.`,
        { spotInstanceRequestId: instance.spotInstanceRequestId, ...failureDetails(error) },
      );
      await rollbackActivation(context, instance.instanceId, stale);
      if (stale) outcome.staleCount++;
      else outcome.coldFallbacks++;
      continue;
    }
    outcome.started.push(instance.instanceId);
    await bestEffort('record the activation of', instance.instanceId, () =>
      context.index.markActivated(instance.instanceId, activatedAt),
    );
    if (instance.spotInstanceRequestId) {
      await detachSpotRequest(context.warmOperations, instance.instanceId, instance.spotInstanceRequestId);
    }
  }
  return outcome;
}

function activationTags(githubRunnerConfig: CreateGitHubRunnerConfig, activatedAt: string): Tag[] {
  const tags = [
    { Key: WARM_ACTIVATED_TAG, Value: activatedAt },
    { Key: 'ghr:Owner', Value: githubRunnerConfig.runnerOwner },
    { Key: 'ghr:Type', Value: githubRunnerConfig.runnerType },
  ];
  const traceId = yn(process.env.POWERTOOLS_TRACE_ENABLED, { default: false })
    ? tracer.getRootXrayTraceId()
    : undefined;
  if (traceId) tags.push({ Key: TRACE_ID_TAG, Value: traceId });
  return tags;
}

async function createRunnerConfig(
  context: ActivationContext,
  createStartRunnerConfig: CreateStartRunnerConfig,
  input: WarmActivationInput,
  instances: StandbyInstance[],
): Promise<string[]> {
  const instanceIds = instances.map(({ instanceId }) => instanceId);
  if (instanceIds.length === 0) return [];
  try {
    return await createStartRunnerConfig(
      input.githubRunnerConfig,
      instanceIds,
      input.ghClient,
      createEc2StartRunnerConfigOptions(context.ec2Operations, context.storage),
    );
  } catch (error) {
    logger.error('Unexpected error while registering GitHub runners for warm instances.', {
      error,
      retryable: true,
      failedInstances: instanceIds,
    });
    return instanceIds;
  }
}

async function rollbackActivation(context: ActivationContext, instanceId: string, stale = false): Promise<void> {
  await bestEffort('delete the runner configuration of', instanceId, () =>
    context.storage.runnerConfig.delete(instanceId),
  );
  await bestEffort('remove the activation tag from', instanceId, () =>
    context.ec2Operations.untag(instanceId, [{ Key: WARM_ACTIVATED_TAG }, { Key: TRACE_ID_TAG }]),
  );
  await bestEffort('restore the pool tags of', instanceId, () =>
    context.ec2Operations.tag(instanceId, [
      { Key: 'ghr:Owner', Value: context.pool.runnerOwner },
      { Key: 'ghr:Type', Value: context.pool.runnerType },
    ]),
  );
  if (stale) {
    await bestEffort('mark the index entry unusable of', instanceId, () => context.index.markUnusable(instanceId));
  } else {
    await releaseClaim(context.index, instanceId);
  }
}

async function releaseClaim(index: WarmIndexStore, instanceId: string): Promise<void> {
  await bestEffort('release the claim of', instanceId, () => index.release(instanceId));
}

async function bestEffort(description: string, instanceId: string, operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    logger.error(`Failed to ${description} warm instance '${instanceId}'.`, failureDetails(error));
  }
}

async function detachSpotRequest(
  warmOperations: Ec2WarmActivationOperations,
  instanceId: string,
  spotInstanceRequestId: string,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await warmOperations.standby.cancelSpotRequest(spotInstanceRequestId);
      return;
    } catch (error) {
      if (attempt < SPOT_CANCEL_ATTEMPTS) continue;
      // The pool lambda cancels it later as an orphan once the activation has settled.
      logger.error(
        `Failed to cancel spot request '${spotInstanceRequestId}' of activated warm instance '${instanceId}'.`,
        {
          spotInstanceRequestId,
          ...failureDetails(error),
        },
      );
      return;
    }
  }
}

function publishActivationMetrics(
  environment: string,
  activations: number,
  fallbacks: Map<WarmActivationFallbackReason, number>,
): void {
  if (!yn(process.env.ENABLE_METRIC_WARM_POOL, { default: false })) return;
  createSingleMetric('WarmPoolActivations', MetricUnit.Count, activations, { Environment: environment });
  for (const [reason, count] of fallbacks) {
    createSingleMetric('WarmPoolActivationFallbacks', MetricUnit.Count, count, {
      Environment: environment,
      Reason: reason,
    });
  }
}
