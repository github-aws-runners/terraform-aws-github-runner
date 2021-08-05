import { EC2, SSM } from 'aws-sdk';

export interface RunnerInfo {
  instanceId: string;
  launchTime: Date | undefined;
  repo: string | undefined;
  org: string | undefined;
}

export interface ListRunnerFilters {
  runnerType?: 'Org' | 'Repo';
  runnerOwner?: string;
  environment: string | undefined;
}

export interface RunnerInputParameters {
  runnerServiceConfig: string;
  environment: string;
  runnerType: 'Org' | 'Repo';
  runnerOwner: string;
}

export async function listRunners(filters: ListRunnerFilters | undefined = undefined): Promise<RunnerInfo[]> {
  const ec2 = new EC2();
  const ec2Filters = [
    { Name: 'tag:Application', Values: ['github-action-runner'] },
    { Name: 'instance-state-name', Values: ['running', 'pending'] },
  ];
  if (filters) {
    if (filters.environment !== undefined) {
      ec2Filters.push({ Name: 'tag:Environment', Values: [filters.environment] });
    }
    if (filters.runnerType && filters.runnerOwner) {
      ec2Filters.push({ Name: `tag:${filters.runnerType}`, Values: [filters.runnerOwner] });
    }
  }
  const runningInstances = await ec2.describeInstances({ Filters: ec2Filters }).promise();
  const runners: RunnerInfo[] = [];
  if (runningInstances.Reservations) {
    for (const r of runningInstances.Reservations) {
      if (r.Instances) {
        for (const i of r.Instances) {
          runners.push({
            instanceId: i.InstanceId as string,
            launchTime: i.LaunchTime,
            repo: i.Tags?.find((e) => e.Key === 'Repo')?.Value,
            org: i.Tags?.find((e) => e.Key === 'Org')?.Value,
          });
        }
      }
    }
  }
  return runners;
}

export async function terminateRunner(runner: RunnerInfo): Promise<void> {
  const ec2 = new EC2();
  await ec2
    .terminateInstances({
      InstanceIds: [runner.instanceId],
    })
    .promise();
  console.debug('Runner terminated.' + runner.instanceId);
}

export async function createRunner(runnerParameters: RunnerInputParameters, launchTemplateName: string): Promise<void> {
  console.debug('Runner configuration: ' + JSON.stringify(runnerParameters));
  const ec2 = new EC2();
  const runInstancesResponse = await ec2
    .runInstances(getInstanceParams(launchTemplateName, runnerParameters))
    .promise();
  console.info('Created instance(s): ', runInstancesResponse.Instances?.map((i) => i.InstanceId).join(','));
  const ssm = new SSM();
  runInstancesResponse.Instances?.forEach(async (i: EC2.Instance) => {
    await ssm
      .putParameter({
        Name: runnerParameters.environment + '-' + (i.InstanceId as string),
        Value: runnerParameters.runnerServiceConfig,
        Type: 'SecureString',
      })
      .promise();
  });
}

function getInstanceParams(
  launchTemplateName: string,
  runnerParameters: RunnerInputParameters,
): EC2.RunInstancesRequest {
  return {
    MaxCount: 1,
    MinCount: 1,
    LaunchTemplate: {
      LaunchTemplateName: launchTemplateName,
      Version: '$Default',
    },
    SubnetId: getSubnet(),
    TagSpecifications: [
      {
        ResourceType: 'instance',
        Tags: [
          { Key: 'Application', Value: 'github-action-runner' },
          {
            Key: runnerParameters.runnerType,
            Value: runnerParameters.runnerOwner,
          },
        ],
      },
    ],
  };
}

function getSubnet(): string {
  const subnets = process.env.SUBNET_IDS.split(',');
  return subnets[Math.floor(Math.random() * subnets.length)];
}
