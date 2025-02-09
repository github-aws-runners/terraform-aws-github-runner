import { DescribeInstancesCommand, EC2Client, Instance } from '@aws-sdk/client-ec2';

export async function getInstances(ec2: EC2Client, instanceId: string[]): Promise<Instance[]> {
  const result = await ec2.send(new DescribeInstancesCommand({ InstanceIds: instanceId }));
  const instances = result.Reservations?.[0]?.Instances;
  return instances ?? [];
}

export function tagFilter(instance: Instance | null, tagFilters: Record<string, string>): boolean {
  return Object.keys(tagFilters).every((key) => {
    return instance?.Tags?.find((tag) => tag.Key === key && tag.Value?.startsWith(tagFilters[key]));
  });
}
