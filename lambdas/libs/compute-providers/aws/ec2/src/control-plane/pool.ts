import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import type {
  CreateStartRunnerConfig,
  CreatePoolRunnersInput,
  ListPoolRunnersInput,
  PoolComputeProvider,
  RunnerInfo,
  RunnerStatus,
} from '../../../../core';
import { bootTimeExceeded, type Ec2RunnerResourceOperations } from '../runners';
import { createRunners, loadEc2ProviderConfig } from './runner-config';

const logger = createChildLogger('pool');

export function createEc2PoolProvider(
  runnerOperations: Ec2RunnerResourceOperations,
  createStartRunnerConfig: CreateStartRunnerConfig,
): Omit<PoolComputeProvider<RunnerInfo>, 'type'> {
  return {
    async listRunners({ environment, runnerOwner, runnerType }: ListPoolRunnersInput): Promise<RunnerInfo[]> {
      return await runnerOperations.list({
        environment,
        runnerOwner,
        runnerType,
        statuses: ['running'],
      });
    },

    countAvailableRunners: calculateEc2PoolSize,

    async createRunners({
      githubRunnerConfig,
      numberOfRunners,
      githubInstallationClient,
    }: CreatePoolRunnersInput): Promise<string[]> {
      const config = loadEc2ProviderConfig();

      const { instances } = await createRunners(
        runnerOperations,
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
      );
      return instances;
    },
  };
}

export function calculateEc2PoolSize(
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
