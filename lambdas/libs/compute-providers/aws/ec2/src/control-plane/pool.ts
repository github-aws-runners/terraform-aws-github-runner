import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import type {
  CreateStartRunnerConfig,
  PoolComputeProvider,
  PoolStandbyOperations,
  RunnerInfo,
  RunnerStatus,
  StandbyBatchResult,
} from '../../../../core';
import { bootTimeExceeded, type Ec2RunnerResourceOperations } from '../runners';
import type { Ec2StandbyOperations } from '../standby';
import { toControlPlaneCreateRunnerResult } from './create-result';
import { createRunners, loadEc2ProviderConfig } from './runner-creation';

const logger = createChildLogger('pool');

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

function createEc2StandbyCapability(standbyOperations: Ec2StandbyOperations): PoolStandbyOperations {
  return {
    list: (input) => standbyOperations.listStandby(input, { spotRequests: true }),
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
      return toControlPlaneCreateRunnerResult(result, config.scaleErrors);
    },
    destroy: (instances) =>
      forEachSettled(
        instances,
        (instance) => instance.instanceId,
        (instance) => standbyOperations.destroyInstance(instance),
        'destroy standby instance',
      ),
    cancelSpotRequests: (requests) =>
      forEachSettled(
        requests,
        (request) => request.spotInstanceRequestId,
        // destroyInstance cancels the request before terminating, so the replacement cannot respawn.
        ({ spotInstanceRequestId, replacementInstanceId }) =>
          replacementInstanceId
            ? standbyOperations.destroyInstance({ instanceId: replacementInstanceId, spotInstanceRequestId })
            : standbyOperations.cancelSpotRequest(spotInstanceRequestId),
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
  standbyOperations?: Ec2StandbyOperations,
): Omit<PoolComputeProvider<RunnerInfo>, 'type'> {
  return {
    ...(standbyOperations ? { standby: createEc2StandbyCapability(standbyOperations) } : {}),
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
