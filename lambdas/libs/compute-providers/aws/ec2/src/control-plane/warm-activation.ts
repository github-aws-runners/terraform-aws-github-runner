import { createChildLogger, createSingleMetric } from '@aws-github-runner/aws-powertools-util';
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
import { type Ec2RunnerResourceOperations, failureDetails } from '../runners';
import { type Ec2StandbyOperations, WARM_ACTIVATED_TAG, WARM_ACTIVATION_GRACE_MS } from '../standby';
import type { WarmLeaseStore } from '../warm-lease';
import { createEc2StartRunnerConfigOptions } from './runner-creation';

const logger = createChildLogger('ec2-warm-activation');
const SPOT_CANCEL_ATTEMPTS = 3;

export type WarmActivationFallbackReason = 'no-warm-instance' | 'claim-lost' | 'lease-unavailable' | 'start-failed';

export interface Ec2WarmActivationOperations {
  standby: Pick<Ec2StandbyOperations, 'listStandby' | 'startInstance' | 'cancelSpotRequest'>;
  createLeaseStore(tableName: string): WarmLeaseStore;
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
  lease: WarmLeaseStore;
  pool: ListStandbyInput;
  storage: RunnerConfigStorage;
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

  const { lease, claimed } = await claimWarmInstances(warmOperations, pool, input.numberOfRunners, fallBack);
  const instances: string[] = [];
  let retryableErrorCount = 0;

  if (lease && claimed.length > 0) {
    const context: ActivationContext = { ec2Operations, lease, pool, storage: input.storage };

    const tagged: StandbyInstance[] = [];
    for (const instance of claimed) {
      try {
        await ec2Operations.tag(instance.instanceId, activationTags(input.githubRunnerConfig));
        tagged.push(instance);
      } catch (error) {
        logger.warn(`Failed to tag warm instance '${instance.instanceId}' for activation.`, failureDetails(error));
        await rollbackActivation(context, instance.instanceId);
        fallBack('start-failed', 1);
      }
    }

    const failedConfig = await createRunnerConfig(context, createStartRunnerConfig, input, tagged);
    for (const instanceId of failedConfig) await rollbackActivation(context, instanceId);
    retryableErrorCount = failedConfig.length;

    for (const instance of tagged.filter(({ instanceId }) => !failedConfig.includes(instanceId))) {
      try {
        await warmOperations.standby.startInstance(instance.instanceId);
      } catch (error) {
        logger.warn(`Failed to start warm instance '${instance.instanceId}', falling back to a cold launch.`, {
          spotInstanceRequestId: instance.spotInstanceRequestId,
          ...failureDetails(error),
        });
        await rollbackActivation(context, instance.instanceId);
        fallBack('start-failed', 1);
        continue;
      }
      // The lease is kept until its TTL so a concurrent stale listing cannot claim the instance again.
      instances.push(instance.instanceId);
      if (instance.spotInstanceRequestId) {
        await detachSpotRequest(warmOperations, instance.instanceId, instance.spotInstanceRequestId);
      }
    }
  }

  if (instances.length > 0) logger.info(`Activated warm instance(s): ${instances.join(',')}`);
  if (fallbacks.size > 0) logger.info('Some runners fall back to a cold launch.', Object.fromEntries(fallbacks));
  publishActivationMetrics(environment, instances.length, fallbacks);

  return {
    instances,
    retryableErrorCount,
    coldRunnerCount: input.numberOfRunners - instances.length - retryableErrorCount,
  };
}

async function claimWarmInstances(
  warmOperations: Ec2WarmActivationOperations,
  pool: ListStandbyInput,
  count: number,
  fallBack: FallBack,
): Promise<{ lease?: WarmLeaseStore; claimed: StandbyInstance[] }> {
  const tableName = process.env.WARM_POOL_LEASE_TABLE_NAME;
  if (!tableName) {
    logger.warn('WARM_POOL_LEASE_TABLE_NAME is not set, skipping warm activation.');
    fallBack('lease-unavailable', count);
    return { claimed: [] };
  }

  let candidates: StandbyInstance[];
  try {
    const launchedAt = (instance: StandbyInstance) => instance.launchTime?.getTime() ?? 0;
    // Scale-down sweeps expired standby instances, so never activate one that expires during activation.
    const claimableUntil = Date.now() + WARM_ACTIVATION_GRACE_MS;
    candidates = (await warmOperations.standby.listStandby(pool))
      .filter((instance) => instance.state === 'WARM')
      .filter((instance) => {
        const expiresAt = Date.parse(instance.expiresAt ?? '');
        return Number.isNaN(expiresAt) || expiresAt > claimableUntil;
      })
      .sort((a, b) => launchedAt(b) - launchedAt(a));
  } catch (error) {
    logger.warn('Unable to list warm instances, skipping warm activation.', failureDetails(error));
    fallBack('no-warm-instance', count);
    return { claimed: [] };
  }

  const lease = warmOperations.createLeaseStore(tableName);
  const claimed: StandbyInstance[] = [];
  let claimLost = false;
  for (const candidate of candidates) {
    if (claimed.length === count) break;
    try {
      if (await lease.claim(candidate.instanceId)) {
        claimed.push(candidate);
      } else {
        claimLost = true;
        logger.debug(`Warm instance '${candidate.instanceId}' is claimed by another invocation.`);
      }
    } catch (error) {
      logger.warn('Warm pool lease table is unavailable, skipping warm activation.', failureDetails(error));
      for (const instance of claimed) await releaseLease(lease, instance.instanceId);
      fallBack('lease-unavailable', count);
      return { claimed: [] };
    }
  }

  fallBack(claimLost ? 'claim-lost' : 'no-warm-instance', count - claimed.length);
  return { lease, claimed };
}

function activationTags(githubRunnerConfig: CreateGitHubRunnerConfig): Tag[] {
  return [
    { Key: WARM_ACTIVATED_TAG, Value: new Date().toISOString() },
    { Key: 'ghr:Owner', Value: githubRunnerConfig.runnerOwner },
    { Key: 'ghr:Type', Value: githubRunnerConfig.runnerType },
  ];
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

async function rollbackActivation(context: ActivationContext, instanceId: string): Promise<void> {
  await bestEffort('delete the runner configuration of', instanceId, () =>
    context.storage.runnerConfig.delete(instanceId),
  );
  await bestEffort('remove the activation tag from', instanceId, () =>
    context.ec2Operations.untag(instanceId, [{ Key: WARM_ACTIVATED_TAG }]),
  );
  await bestEffort('restore the pool tags of', instanceId, () =>
    context.ec2Operations.tag(instanceId, [
      { Key: 'ghr:Owner', Value: context.pool.runnerOwner },
      { Key: 'ghr:Type', Value: context.pool.runnerType },
    ]),
  );
  await releaseLease(context.lease, instanceId);
}

async function releaseLease(lease: WarmLeaseStore, instanceId: string): Promise<void> {
  await bestEffort('release the lease of', instanceId, () => lease.release(instanceId));
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
