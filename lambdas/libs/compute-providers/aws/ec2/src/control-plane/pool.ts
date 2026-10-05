import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import type {
  CreateStartRunnerConfig,
  ListStandbyInput,
  PoolComputeProvider,
  PoolStandbyOperations,
  RunnerInfo,
  RunnerStatus,
  StandbyBatchResult,
  StandbyInstance,
} from '../../../../core';
import { bootTimeExceeded, type Ec2RunnerResourceOperations, failureDetails } from '../runners';
import type { Ec2StandbyOperations, Ec2StandbyRead } from '../standby';
import type { WarmIndexItem, WarmIndexState, WarmIndexStore, WarmIndexUpdate } from '../warm-index';
import { toControlPlaneCreateRunnerResult } from './create-result';
import { createRunners, loadEc2ProviderConfig } from './runner-creation';

const logger = createChildLogger('pool');

export const WARM_POOL_RECONCILE_INTERVAL_SECONDS = 60 * 60;

export type CreateWarmIndexStore = (tableName: string, environment: string) => WarmIndexStore;

function countAvailableEc2PoolRunners(
  ec2runners: RunnerInfo[],
  runnerStatus: Map<string, RunnerStatus>,
  includeBusyRunners = false,
): number {
  // Runner should be considered idle if it is still booting, or is idle in GitHub
  let numberOfRunnersInPool = 0;
  for (const ec2Instance of ec2runners) {
    if (
      (runnerStatus.get(ec2Instance.id)?.busy === false || includeBusyRunners) &&
      runnerStatus.get(ec2Instance.id)?.status === 'online'
    ) {
      numberOfRunnersInPool++;
      logger.debug(`Runner ${ec2Instance.id} is idle in GitHub and counted as part of the pool`);
    } else if (runnerStatus.get(ec2Instance.id) != null) {
      logger.debug(`Runner ${ec2Instance.id} is not idle in GitHub and NOT counted as part of the pool`);
    } else if (!bootTimeExceeded(ec2Instance)) {
      numberOfRunnersInPool++;
      logger.info(`Runner ${ec2Instance.id} is still booting and counted as part of the pool`);
    } else {
      logger.debug(`Runner ${ec2Instance.id} is not idle in GitHub nor booting and not counted as part of the pool`);
    }
  }
  return numberOfRunnersInPool;
}

async function forEachSettled<TItem>(
  items: TItem[],
  idOf: (item: TItem) => string,
  operation: (item: TItem) => Promise<void>,
  description: string,
): Promise<StandbyBatchResult> {
  const result: StandbyBatchResult = { succeeded: [], failed: [] };
  for (const item of items) {
    const id = idOf(item);
    try {
      await operation(item);
      result.succeeded.push(id);
    } catch (error) {
      logger.error(`Failed to ${description} '${id}'.`, { error });
      result.failed.push(id);
    }
  }
  return result;
}

function indexUpdate(instance: StandbyInstance): WarmIndexUpdate {
  return {
    instanceId: instance.instanceId,
    state: instance.state as WarmIndexState,
    launchTime: instance.launchTime?.toISOString(),
    expiresAt: instance.expiresAt,
    spotInstanceRequestId: instance.spotInstanceRequestId,
  };
}

function changed(item: WarmIndexItem | undefined, update: WarmIndexUpdate): boolean {
  return (
    item === undefined ||
    item.state !== update.state ||
    item.launchTime !== update.launchTime ||
    item.expiresAt !== update.expiresAt ||
    item.spotInstanceRequestId !== update.spotInstanceRequestId
  );
}

async function bestEffort(description: string, operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    logger.warn(`Failed to ${description}.`, failureDetails(error));
  }
}

// Instances launched but never indexed (for example a crash before the write) are found by a rare tag scan.
async function adoptUntracked(
  standbyOperations: Ec2StandbyOperations,
  index: WarmIndexStore,
  input: ListStandbyInput,
  items: WarmIndexItem[],
): Promise<void> {
  const tracked = new Set(items.map(({ instanceId }) => instanceId));
  const untracked = (await standbyOperations.listStandby(input)).filter(
    (instance) => !tracked.has(instance.instanceId) && instance.state !== 'ACTIVE',
  );
  for (const instance of untracked) {
    const update = indexUpdate(instance);
    await index.update(update);
    items.push(update);
  }
  if (untracked.length > 0) {
    logger.info(`Adopted ${untracked.length} warm instance(s) missing from the warm pool index.`, {
      instanceIds: untracked.map(({ instanceId }) => instanceId),
    });
  }
}

async function syncIndex(index: WarmIndexStore, items: WarmIndexItem[], read: Ec2StandbyRead): Promise<void> {
  const itemById = new Map(items.map((item) => [item.instanceId, item]));
  for (const instance of read.instances) {
    const update = indexUpdate(instance);
    if (changed(itemById.get(instance.instanceId), update)) {
      await bestEffort(`update the warm pool index entry of '${instance.instanceId}'`, () => index.update(update));
    }
  }
  for (const instanceId of read.releasedInstanceIds) {
    await bestEffort(`remove the warm pool index entry of '${instanceId}'`, () => index.remove(instanceId));
  }
}

function createEc2StandbyCapability(
  standbyOperations: Ec2StandbyOperations,
  createIndexStore: CreateWarmIndexStore,
): PoolStandbyOperations {
  let store: WarmIndexStore | undefined;
  const index = (): WarmIndexStore => {
    if (!store) {
      const tableName = process.env.WARM_POOL_INDEX_TABLE_NAME;
      if (!tableName) throw new Error('WARM_POOL_INDEX_TABLE_NAME is not set.');
      store = createIndexStore(tableName, process.env.ENVIRONMENT);
    }
    return store;
  };

  return {
    list: async (input) => {
      const items = await index().query();
      if (await index().claimReconcile(WARM_POOL_RECONCILE_INTERVAL_SECONDS)) {
        await adoptUntracked(standbyOperations, index(), input, items);
      }
      const read = await standbyOperations.readStandby(
        items.map(({ instanceId, spotInstanceRequestId, activatedAt }) => ({
          instanceId,
          spotInstanceRequestId,
          activatedAt,
        })),
      );
      await syncIndex(index(), items, read);
      return {
        instances: read.instances,
        orphanedSpotRequests: read.orphanedSpotRequests,
        spotStateKnown: read.spotStateKnown,
      };
    },
    launch: async ({ environment, runnerOwner, runnerType, numberOfInstances, maxAgeHours }) => {
      const config = loadEc2ProviderConfig();
      const result = await standbyOperations.launchWarm({
        environment,
        runnerOwner,
        runnerType,
        subnets: config.subnets,
        launchTemplateName: config.launchTemplateName,
        ec2instanceCriteria: config.ec2instanceCriteria,
        amiIdSsmParameterName: config.amiIdSsmParameterName,
        tracingEnabled: config.tracingEnabled,
        numberOfRunners: numberOfInstances,
        source: 'pool-lambda',
        maxAgeHours,
      });
      for (const instanceId of result.instances) {
        await bestEffort(`index launched warm instance '${instanceId}'`, () =>
          index().update({ instanceId, state: 'PRIMING' }),
        );
      }
      return toControlPlaneCreateRunnerResult(result, config.scaleErrors);
    },
    destroy: (instances) =>
      forEachSettled(
        instances,
        (instance) => instance.instanceId,
        async (instance) => {
          // A live claim means scale-up is activating the instance right now.
          if (!(await index().removeUnclaimed(instance.instanceId))) {
            throw new Error(`Warm instance '${instance.instanceId}' is claimed by scale-up, not destroying it.`);
          }
          await standbyOperations.destroyInstance(instance);
        },
        'destroy standby instance',
      ),
    cancelSpotRequests: (requests) =>
      forEachSettled(
        requests,
        (request) => request.spotInstanceRequestId,
        async ({ spotInstanceRequestId, instanceId, replacementInstanceId }) => {
          // destroyInstance cancels the request before terminating, so the replacement cannot respawn.
          if (replacementInstanceId) {
            await standbyOperations.destroyInstance({ instanceId: replacementInstanceId, spotInstanceRequestId });
          } else {
            await standbyOperations.cancelSpotRequest(spotInstanceRequestId);
          }
          if (instanceId) {
            await bestEffort(`remove the warm pool index entry of '${instanceId}'`, () => index().remove(instanceId));
          }
        },
        'clean up spot instance request',
      ),
    currentImage: () => {
      const { launchTemplateName, amiIdSsmParameterName } = loadEc2ProviderConfig();
      return standbyOperations.currentImage({ launchTemplateName, amiIdSsmParameterName });
    },
  };
}

export function createEc2PoolCapability(
  ec2Operations: Ec2RunnerResourceOperations,
  createStartRunnerConfig: CreateStartRunnerConfig,
  warm?: { standbyOperations: Ec2StandbyOperations; createIndexStore: CreateWarmIndexStore },
): Omit<PoolComputeProvider<RunnerInfo>, 'type'> {
  return {
    ...(warm ? { standby: createEc2StandbyCapability(warm.standbyOperations, warm.createIndexStore) } : {}),
    listRunners: ({ environment, runnerOwner, runnerType }) =>
      ec2Operations.list({
        environment,
        runnerOwner,
        runnerType,
        statuses: ['running'],
      }),
    countAvailableRunners: countAvailableEc2PoolRunners,
    createRunners: async ({ githubRunnerConfig, numberOfRunners, githubInstallationClient, storage }) => {
      const config = loadEc2ProviderConfig();

      const { instances } = await createRunners(
        ec2Operations,
        githubRunnerConfig,
        {
          ec2instanceCriteria: config.ec2instanceCriteria,
          environment: config.environment,
          launchTemplateName: config.launchTemplateName,
          subnets: config.subnets,
          amiIdSsmParameterName: config.amiIdSsmParameterName,
          tracingEnabled: config.tracingEnabled,
          onDemandFailoverOnError: config.onDemandFailoverOnError,
          scaleErrors: config.scaleErrors,
        },
        numberOfRunners,
        githubInstallationClient,
        createStartRunnerConfig,
        'pool-lambda',
        storage,
      );
      return instances;
    },
  };
}
