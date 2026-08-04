import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import type {
  CreateStartRunnerConfig,
  CreatePoolRunnersInput,
  ListPoolRunnersInput,
  PoolRunnerProvider,
  RunnerStatus,
} from '../../../../core';
import { createRunners, loadEc2ProviderConfig } from './runner-config';
import { bootTimeExceeded, listEC2Runners } from './runners';
import type { RunnerList } from './runners.d';

const logger = createChildLogger('pool');

async function listEc2PoolRunners({
  environment,
  runnerOwner,
  runnerType,
}: ListPoolRunnersInput): Promise<RunnerList[]> {
  return await listEC2Runners({
    environment,
    runnerOwner,
    runnerType,
    statuses: ['running'],
  });
}

async function createEc2PoolRunners(
  { githubRunnerConfig, numberOfRunners, githubInstallationClient }: CreatePoolRunnersInput,
  createStartRunnerConfig: CreateStartRunnerConfig,
): Promise<string[]> {
  const config = loadEc2ProviderConfig();

  const { instances } = await createRunners(
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
}

export function createEc2PoolProvider(
  createStartRunnerConfig: CreateStartRunnerConfig,
): Omit<PoolRunnerProvider, 'type'> {
  return {
    listRunners: listEc2PoolRunners,
    countAvailableRunners: calculateEc2PoolSize,
    createRunners: (input) => createEc2PoolRunners(input, createStartRunnerConfig),
  };
}

export function calculateEc2PoolSize(
  ec2runners: RunnerList[],
  runnerStatus: Map<string, RunnerStatus>,
  includeBusyRunners = false,
): number {
  // Runner should be considered idle if it is still booting, or is idle in GitHub
  let numberOfRunnersInPool = 0;
  for (const ec2Instance of ec2runners) {
    if (
      (runnerStatus.get(ec2Instance.instanceId)?.busy === false || includeBusyRunners) &&
      runnerStatus.get(ec2Instance.instanceId)?.status === 'online'
    ) {
      numberOfRunnersInPool++;
      logger.debug(`Runner ${ec2Instance.instanceId} is idle in GitHub and counted as part of the pool`);
    } else if (runnerStatus.get(ec2Instance.instanceId) != null) {
      logger.debug(`Runner ${ec2Instance.instanceId} is not idle in GitHub and NOT counted as part of the pool`);
    } else if (!bootTimeExceeded(ec2Instance)) {
      numberOfRunnersInPool++;
      logger.info(`Runner ${ec2Instance.instanceId} is still booting and counted as part of the pool`);
    } else {
      logger.debug(
        `Runner ${ec2Instance.instanceId} is not idle in GitHub nor booting and not counted as part of the pool`,
      );
    }
  }
  return numberOfRunnersInPool;
}
