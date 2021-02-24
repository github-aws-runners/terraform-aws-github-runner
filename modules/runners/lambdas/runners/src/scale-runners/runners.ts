import { EC2, SSM } from 'aws-sdk';

export interface RunnerInfo {
  instanceId: string;
  launchTime: Date | undefined;
  repo: string | undefined;
  org: string | undefined;
}

export interface ListRunnerFilters {
  repoName?: string;
  orgName?: string;
  environment?: string;
}

export interface instanceParams {
  MaxCount: number,
  MinCount: number,
  LaunchTemplate: {
    LaunchTemplateName: string,
    Version: string,
  },
  SubnetId: string,
  TagSpecifications: [
    {
      ResourceType: string,
      Tags: [
        { Key: string, Value?: string },
        { Key: string, Value?: string },
      ],
    },
  ],
  InstanceType?: string
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
    if (filters.repoName !== undefined) {
      ec2Filters.push({ Name: 'tag:Repo', Values: [filters.repoName] });
    }
    if (filters.orgName !== undefined) {
      ec2Filters.push({ Name: 'tag:Org', Values: [filters.orgName] });
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

export interface RunnerInputParameters {
  runnerConfig: string;
  environment: string;
  repoName?: string;
  orgName?: string;
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

export async function createRunner(runnerParameters: RunnerInputParameters): Promise<void> {
  const launchTemplateName = process.env.LAUNCH_TEMPLATE_NAME as string;
  const launchTemplateVersion = process.env.LAUNCH_TEMPLATE_VERSION as string;

  const subnets = (process.env.SUBNET_IDS as string).split(',');
  const randomSubnet = subnets[Math.floor(Math.random() * subnets.length)];
  console.debug('Runner configuration: ' + JSON.stringify(runnerParameters));

  const instanceParams : instanceParams = {
    MaxCount: 1,
    MinCount: 1,
    LaunchTemplate: {
      LaunchTemplateName: launchTemplateName,
      Version: launchTemplateVersion,
    },
    SubnetId: randomSubnet,
    TagSpecifications: [
      {
        ResourceType: 'instance',
        Tags: [
          { Key: 'Application', Value: 'github-action-runner' },
          {
            Key: runnerParameters.orgName ? 'Org' : 'Repo',
            Value: runnerParameters.orgName ? runnerParameters.orgName : runnerParameters.repoName,
          },
        ],
      },
    ],
  }

  const ec2 = new EC2();
  try {
    const runInstancesResponse = await ec2
      .runInstances(instanceParams, 
        async function(err, data) {
          if (err) {
            console.info(err)
            instanceParams.InstanceType = process.env.SECONDARY_INSTANCE_TYPE as string;
            return await ec2.runInstances(instanceParams)
          }
          return data;
      })
      .promise();
      
      console.info('Created instance(s): ', runInstancesResponse.Instances?.map((i) => i.InstanceId).join(','));
      const ssm = new SSM();
      runInstancesResponse.Instances?.forEach(async (i: EC2.Instance) => {
        await ssm
          .putParameter({
            Name: runnerParameters.environment + '-' + (i.InstanceId as string),
            Value: runnerParameters.runnerConfig,
            Type: 'SecureString',
          })
          .promise();
      });
  }
  catch (e) {
    console.error(e);
  }

}
