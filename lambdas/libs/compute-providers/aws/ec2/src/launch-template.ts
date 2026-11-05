import { DescribeLaunchTemplateVersionsCommand, type EC2Client, type Tag } from '@aws-sdk/client-ec2';

export async function getDefaultBlockDeviceNameFromLaunchTemplate(
  ec2Client: EC2Client,
  launchTemplateName: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  const launchTemplateVersions = await ec2Client.send(
    new DescribeLaunchTemplateVersionsCommand({
      LaunchTemplateName: launchTemplateName,
      Versions: ['$Default'],
    }),
    { abortSignal: signal },
  );
  const blockDeviceMappings =
    launchTemplateVersions.LaunchTemplateVersions?.[0]?.LaunchTemplateData?.BlockDeviceMappings;
  const blockDeviceName =
    blockDeviceMappings?.find((blockDeviceMapping) => blockDeviceMapping.DeviceName && blockDeviceMapping.Ebs)
      ?.DeviceName ?? blockDeviceMappings?.find((blockDeviceMapping) => blockDeviceMapping.DeviceName)?.DeviceName;

  if (!blockDeviceName) {
    throw new Error(`Failed to determine block device name from launch template '${launchTemplateName}'.`);
  }

  return blockDeviceName;
}

export interface LaunchTemplateTags {
  instance: Tag[];
  volume: Tag[];
}

export async function getTagsFromLaunchTemplate(
  ec2Client: EC2Client,
  launchTemplateName: string,
  signal: AbortSignal | undefined,
): Promise<LaunchTemplateTags> {
  const launchTemplateVersions = await ec2Client.send(
    new DescribeLaunchTemplateVersionsCommand({
      LaunchTemplateName: launchTemplateName,
      Versions: ['$Default'],
    }),
    { abortSignal: signal },
  );
  const tagSpecifications = launchTemplateVersions?.LaunchTemplateVersions?.[0]?.LaunchTemplateData?.TagSpecifications;
  const tagsFor = (resourceType: string) =>
    tagSpecifications?.find((spec) => spec.ResourceType === resourceType)?.Tags ?? [];

  return { instance: tagsFor('instance'), volume: tagsFor('volume') };
}
