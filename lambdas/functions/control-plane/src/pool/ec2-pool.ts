import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import yn from 'yn';

import { bootTimeExceeded, listEC2Runners } from '../aws/ec2-runners';
import type { RunnerList } from '../aws/ec2-runners.d';
import { createRunners } from '../scale-runners/ec2';
import type { CreateEC2RunnerConfig } from '../scale-runners/ec2';
import type { CreatePoolRunnersInput, ListPoolRunnersInput, PoolRunnerProvider, RunnerStatus } from './pool-provider';

const logger = createChildLogger('pool');

interface Ec2PoolProviderConfig {
  environment: string;
  subnets: string[];
  launchTemplateName: string;
  ec2instanceCriteria: CreateEC2RunnerConfig['ec2instanceCriteria'];
  amiIdSsmParameterName?: string;
  tracingEnabled?: boolean;
  onDemandFailoverOnError: string[];
  scaleErrors: string[];
}

function loadEc2PoolProviderConfig(): Ec2PoolProviderConfig {
  const scaleErrors = JSON.parse(process.env.SCALE_ERRORS) as [string];

  return {
    environment: process.env.ENVIRONMENT,
    subnets: process.env.SUBNET_IDS.split(','),
    launchTemplateName: process.env.LAUNCH_TEMPLATE_NAME,
    ec2instanceCriteria: {
      instanceTypes: process.env.INSTANCE_TYPES.split(','),
      instanceTypePriorities: process.env.INSTANCE_TYPE_PRIORITIES
        ? (JSON.parse(process.env.INSTANCE_TYPE_PRIORITIES) as Record<string, number>)
        : undefined,
      targetCapacityType: process.env.INSTANCE_TARGET_CAPACITY_TYPE,
      maxSpotPrice: process.env.INSTANCE_MAX_SPOT_PRICE,
      instanceAllocationStrategy: process.env.INSTANCE_ALLOCATION_STRATEGY || 'lowest-price',
    },
    amiIdSsmParameterName: process.env.AMI_ID_SSM_PARAMETER_NAME,
    tracingEnabled: yn(process.env.POWERTOOLS_TRACE_ENABLED, { default: false }),
    onDemandFailoverOnError: process.env.ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS
      ? (JSON.parse(process.env.ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS) as [string])
      : [],
    scaleErrors,
  };
}

export function createEc2PoolProvider(): PoolRunnerProvider {
  const config = loadEc2PoolProviderConfig();

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

  async function createEc2PoolRunners({
    githubRunnerConfig,
    numberOfRunners,
    githubInstallationClient,
  }: CreatePoolRunnersInput): Promise<string[]> {
    return await createRunners(
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
      'pool-lambda',
    );
  }

  return {
    listRunners: listEc2PoolRunners,
    countAvailableRunners: calculateEc2PoolSize,
    createRunners: createEc2PoolRunners,
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
