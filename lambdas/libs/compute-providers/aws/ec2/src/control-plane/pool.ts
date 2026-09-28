import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import type { CreateStartRunnerConfig, PoolComputeProvider, RunnerInfo, RunnerStatus } from '../../../../core';
import { bootTimeExceeded, type Ec2RunnerResourceOperations } from '../runners';
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
    const status = runnerStatus.get(ec2Instance.id);
    // A runner can be registered before its agent connects (for example with JIT config) and is
    // then reported as offline. Treat it like an unregistered runner until its boot time expires.
    const registeredOffline = status?.status === 'offline' && status.busy === false;
    if ((status?.busy === false || includeBusyRunners) && status?.status === 'online') {
      numberOfRunnersInPool++;
      logger.debug(`Runner ${ec2Instance.id} is idle in GitHub and counted as part of the pool`);
    } else if (status != null && !registeredOffline) {
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

export function createEc2PoolCapability(
  ec2Operations: Ec2RunnerResourceOperations,
  createStartRunnerConfig: CreateStartRunnerConfig,
): Omit<PoolComputeProvider<RunnerInfo>, 'type'> {
  return {
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
