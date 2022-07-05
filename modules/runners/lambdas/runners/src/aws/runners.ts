import { EC2, SSM } from 'aws-sdk';

import { LogFields, logger as rootLogger } from '../logger';
import ScaleError from './../scale-runners/ScaleError';

const logger = rootLogger.getChildLogger({ name: 'runners' });

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
  subnets: string[];
  launchTemplateName: string;
  ec2instanceCriteria: {
    instanceTypes: string[];
    targetCapacityType: EC2.DefaultTargetCapacityType;
    maxSpotPrice?: string;
    instanceAllocationStrategy: EC2.SpotAllocationStrategy;
  };
  numberOfRunners?: number;
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

  // ***Deprecation Notice***
  // Support for legacy `Application` tag keys
  // will be removed in next major release.
  for (const key of ['tag:ghr:Application', 'tag:Application']) {
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
  logger.info(`Runner ${instanceId} has been terminated.`, LogFields.print());
}

function generateFleeOverrides(
  subnetIds: string[],
  instancesTypes: string[],
): EC2.FleetLaunchTemplateOverridesListRequest {
  const result: EC2.FleetLaunchTemplateOverridesListRequest = [];
  subnetIds.forEach((s) => {
    instancesTypes.forEach((i) => {
      result.push({
        SubnetId: s,
        InstanceType: i,
      });
    });
  });
  return result;
}

export async function createRunner(runnerParameters: RunnerInputParameters): Promise<void> {
  logger.debug('Runner configuration: ' + JSON.stringify(runnerParameters), LogFields.print());

  const ec2 = new EC2();
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
            Overrides: generateFleeOverrides(
              runnerParameters.subnets,
              runnerParameters.ec2instanceCriteria.instanceTypes,
            ),
          },
        ],
        SpotOptions: {
          MaxTotalPrice: runnerParameters.ec2instanceCriteria.maxSpotPrice,
          AllocationStrategy: 'capacity-optimized',
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
              { Key: 'Type', Value: runnerParameters.runnerType },
              { Key: 'Owner', Value: runnerParameters.runnerOwner },
            ],
          },
        ],
        Type: 'instant',
      })
      .promise();
  } catch (e) {
    logger.warn('Create fleet request failed.', e);
    throw e;
  }

  const instances: string[] = fleet.Instances?.flatMap((i) => i.InstanceIds?.flatMap((j) => j) || []) || [];

  if (instances.length === 0) {
    logger.warn(`No instances created by fleet request. Check configuration! Response:`, fleet);
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
    ];

    if (errors.some((e) => scaleErrors.includes(e))) {
      logger.warn('Create fleet failed, ScaleError will be thrown to trigger retry for ephemeral runners.');
      logger.debug('Create fleet failed.', fleet.Errors);
      throw new ScaleError('Failed to create instance, create fleet failed.');
    } else {
      logger.warn('Create fleet failed, error not recognized as scaling error.', fleet.Errors);
      throw Error('Create fleet failed, no instance created.');
    }
  }

  logger.info('Created instance(s): ', instances.join(','), LogFields.print());

  const ssm = new SSM();
  for (const instance of instances) {
    await ssm
      .putParameter({
        Name: `${runnerParameters.environment}-${instance}`,
        Value: runnerParameters.runnerServiceConfig.join(' '),
        Type: 'SecureString',
      })
      .promise();
  }
}
