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
}

export async function listRunners(filters: ListRunnerFilters | undefined = undefined): Promise<RunnerInfo[]> {
  const ec2 = new EC2();
  let ec2Filters = [
    { Name: 'tag:Application', Values: ['github-action-runner'] },
    { Name: 'instance-state-name', Values: ['running', 'pending'] },
  ];
  if (filters) {
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
  repoName?: string;
  orgName?: string;
}

export async function creatRunner(runnerParameters: RunnerInputParameters): Promise<void> {
  const launchTemplateName = process.env.LAUNCH_TEMPLATE_NAME as string;
  const launchTemplateVersion = process.env.LAUNCH_TEMPLATE_VERSION as string;
  const environment = process.env.ENVIRONMENT as string;

  const subnets = (process.env.SUBNET_IDS as string).split(',');
  const randomSubnet = subnets[Math.floor(Math.random() * (subnets.length + 1))];
  const ec2 = new EC2();
  console.log(runnerParameters);
  console.log(runnerParameters.orgName ? 'Org' : 'Repo');
  const runInstancesResponse = await ec2
    .runInstances({
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
    })
    .promise();

  const ssm = new SSM();
  runInstancesResponse.Instances?.forEach((i: EC2.Instance) => {
    ssm
      .putParameter({
        Name: (environment + '-' + i.InstanceId) as string,
        Value: runnerParameters.runnerConfig,
        Type: 'SecureString',
      })
      .promise();
  });
}
