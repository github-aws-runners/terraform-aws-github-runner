import { EC2, SSM } from 'aws-sdk';
import moment from 'moment';

import { createChildLogger } from '../logger';
import ScaleError from './../scale-runners/ScaleError';

const logger = createChildLogger('runners');

export interface RunnerList {
  instanceId: string;
  launchTime?: Date;
  owner?: string;
  type?: string;
  repo?: string;
  org?: string;
}

export interface RunnerInfo {
  instanceId: string;
  launchTime?: Date;
  owner: string;
  type: string;
}

export interface ListRunnerFilters {
  runnerType?: 'Org' | 'Repo';
  runnerOwner?: string;
  environment?: string;
  statuses?: string[];
}

export interface RunnerInputParameters {
  runnerServiceConfig: string[];
  environment: string;
  runnerType: 'Org' | 'Repo';
  runnerOwner: string;
  ssmTokenPath: string;
  subnets: string[];
  launchTemplateName: string;
  ec2instanceCriteria: {
    instanceTypes: string[];
    targetCapacityType: EC2.DefaultTargetCapacityType;
    maxSpotPrice?: string;
    instanceAllocationStrategy: EC2.SpotAllocationStrategy;
  };
  numberOfRunners?: number;
  amiIdSsmParameterName?: string;
}

interface Ec2Filter {
  Name: string;
  Values: string[];
}

export async function listEC2Runners(filters: ListRunnerFilters | undefined = undefined): Promise<RunnerList[]> {
  const ec2Filters = constructFilters(filters);
  const runners: RunnerList[] = [];
  for (const filter of ec2Filters) {
    runners.push(...(await getRunners(filter)));
  }
  return runners;
}

function constructFilters(filters?: ListRunnerFilters): Ec2Filter[][] {
  const ec2Statuses = filters?.statuses ? filters.statuses : ['running', 'pending'];
  const ec2Filters: Ec2Filter[][] = [];
  const ec2FiltersBase = [{ Name: 'instance-state-name', Values: ec2Statuses }];
  if (filters) {
    if (filters.environment !== undefined) {
      ec2FiltersBase.push({ Name: 'tag:ghr:environment', Values: [filters.environment] });
    }
    if (filters.runnerType && filters.runnerOwner) {
      ec2FiltersBase.push({ Name: `tag:Type`, Values: [filters.runnerType] });
      ec2FiltersBase.push({ Name: `tag:Owner`, Values: [filters.runnerOwner] });
    }
  }

  for (const key of ['tag:ghr:Application']) {
    const filter = [...ec2FiltersBase];
    filter.push({ Name: key, Values: ['github-action-runner'] });
    ec2Filters.push(filter);
  }
  return ec2Filters;
}

async function getRunners(ec2Filters: Ec2Filter[]): Promise<RunnerList[]> {
  const ec2 = new EC2();
  const runners: RunnerList[] = [];
  let nextToken;
  let hasNext = true;
  while (hasNext) {
    const runningInstances: EC2.DescribeInstancesResult = await ec2
      .describeInstances({ Filters: ec2Filters, NextToken: nextToken })
      .promise();
    hasNext = runningInstances.NextToken ? true : false;
    nextToken = runningInstances.NextToken;
    runners.push(...getRunnerInfo(runningInstances));
  }
  return runners;
}

function getRunnerInfo(runningInstances: EC2.DescribeInstancesResult) {
  const runners: RunnerList[] = [];
  if (runningInstances.Reservations) {
    for (const r of runningInstances.Reservations) {
      if (r.Instances) {
        for (const i of r.Instances) {
          runners.push({
            instanceId: i.InstanceId as string,
            launchTime: i.LaunchTime,
            owner: i.Tags?.find((e) => e.Key === 'Owner')?.Value as string,
            type: i.Tags?.find((e) => e.Key === 'Type')?.Value as string,
            repo: i.Tags?.find((e) => e.Key === 'Repo')?.Value as string,
            org: i.Tags?.find((e) => e.Key === 'Org')?.Value as string,
          });
        }
      }
    }
  }
  return runners;
}

export async function terminateRunner(instanceId: string): Promise<void> {
  const ec2 = new EC2();
  await ec2
    .terminateInstances({
      InstanceIds: [instanceId],
    })
    .promise();
  logger.info(`Runner ${instanceId} has been terminated.`);
}

function generateFleetOverrides(
  subnetIds: string[],
  instancesTypes: string[],
  amiId?: string,
): EC2.FleetLaunchTemplateOverridesListRequest {
  type Override = {
    SubnetId: string;
    InstanceType: string;
    ImageId?: string;
  };
  const result: EC2.FleetLaunchTemplateOverridesListRequest = [];
  subnetIds.forEach((s) => {
    instancesTypes.forEach((i) => {
      const item: Override = {
        SubnetId: s,
        InstanceType: i,
      };
      if (amiId) {
        item.ImageId = amiId;
      }
      result.push(item);
    });
  });
  return result;
}

function removeTokenForLogging(config: string[]): string[] {
  const result: string[] = [];
  config.forEach((e) => {
    if (e.startsWith('--token')) {
      result.push('--token <REDACTED>');
    } else {
      result.push(e);
    }
  });
  return result;
}

export async function createRunner(runnerParameters: RunnerInputParameters): Promise<void> {
  logger.debug('Runner configuration.', {
    runner: {
      configuration: {
        ...runnerParameters,
        runnerServiceConfig: removeTokenForLogging(runnerParameters.runnerServiceConfig),
      },
    },
  });

  const ec2 = new EC2();
  const ssm = new SSM();

  let amiIdOverride = undefined;

  if (runnerParameters.amiIdSsmParameterName) {
    logger.debug(`Looking up runner AMI ID from SSM parameter: ${runnerParameters.amiIdSsmParameterName}`);
    try {
      const result: AWS.SSM.GetParameterResult = await ssm
        .getParameter({ Name: runnerParameters.amiIdSsmParameterName })
        .promise();
      amiIdOverride = result.Parameter?.Value;
    } catch (e) {
      logger.error(
        `Failed to lookup runner AMI ID from SSM parameter: ${runnerParameters.amiIdSsmParameterName}. ` +
          'Please ensure that the given parameter exists on this region and contains a valid runner AMI ID',
        { error: e },
      );
      throw e;
    }
  }

  const numberOfRunners = runnerParameters.numberOfRunners ? runnerParameters.numberOfRunners : 1;

  let fleet: AWS.EC2.CreateFleetResult;
  try {
    // see for spec https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_CreateFleet.html
    fleet = await ec2
      .createFleet({
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
            ),
          },
        ],
        SpotOptions: {
          MaxTotalPrice: runnerParameters.ec2instanceCriteria.maxSpotPrice,
          AllocationStrategy: runnerParameters.ec2instanceCriteria.instanceAllocationStrategy,
        },
        TargetCapacitySpecification: {
          TotalTargetCapacity: numberOfRunners,
          DefaultTargetCapacityType: runnerParameters.ec2instanceCriteria.targetCapacityType,
        },
        TagSpecifications: [
          {
            ResourceType: 'instance',
            Tags: [
              { Key: 'ghr:Application', Value: 'github-action-runner' },
              { Key: 'ghr:created_by', Value: numberOfRunners === 1 ? 'scale-up-lambda' : 'pool-lambda' },
              { Key: 'Type', Value: runnerParameters.runnerType },
              { Key: 'Owner', Value: runnerParameters.runnerOwner },
            ],
          },
        ],
        Type: 'instant',
      })
      .promise();
  } catch (e) {
    logger.warn('Create fleet request failed.', { error: e as Error });
    throw e;
  }

  const instances: string[] = fleet.Instances?.flatMap((i) => i.InstanceIds?.flatMap((j) => j) || []) || [];

  if (instances.length === 0) {
    logger.warn(`No instances created by fleet request. Check configuration! Response:`, { data: fleet });
    const errors = fleet.Errors?.flatMap((e) => e.ErrorCode || '') || [];

    // Educated guess of errors that would make sense to retry based on the list
    // https://docs.aws.amazon.com/AWSEC2/latest/APIReference/errors-overview.html
    const scaleErrors = [
      'UnfulfillableCapacity',
      'MaxSpotInstanceCountExceeded',
      'TargetCapacityLimitExceededException',
      'RequestLimitExceeded',
      'ResourceLimitExceeded',
      'MaxSpotInstanceCountExceeded',
      'MaxSpotFleetRequestCountExceeded',
      'InsufficientInstanceCapacity',
    ];

    if (errors.some((e) => scaleErrors.includes(e))) {
      logger.warn('Create fleet failed, ScaleError will be thrown to trigger retry for ephemeral runners.');
      logger.debug('Create fleet failed.', { data: fleet.Errors });
      throw new ScaleError('Failed to create instance, create fleet failed.');
    } else {
      logger.warn('Create fleet failed, error not recognized as scaling error.', { data: fleet.Errors });
      throw Error('Create fleet failed, no instance created.');
    }
  }

  logger.info(`Created instance(s): ${instances.join(',')}`);

  const delay = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const ssmParameterStoreMaxThroughput = 40;
  const isDelay = instances.length >= ssmParameterStoreMaxThroughput ? true : false;

  for (const instance of instances) {
    await ssm
      .putParameter({
        Name: `${runnerParameters.ssmTokenPath}/${instance}`,
        Value: runnerParameters.runnerServiceConfig.join(' '),
        Type: 'SecureString',
      })
      .promise();

    if (isDelay) {
      // Delay to prevent AWS ssm rate limits by being within the max throughput limit
      await delay(25);
    }
  }
}

// If launchTime is undefined, this will return false
export function bootTimeExceeded(ec2Runner: { launchTime?: Date }): boolean {
  const runnerBootTimeInMinutes = process.env.RUNNER_BOOT_TIME_IN_MINUTES;
  const launchTimePlusBootTime = moment(ec2Runner.launchTime).utc().add(runnerBootTimeInMinutes, 'minutes');
  return launchTimePlusBootTime < moment(new Date()).utc();
}
