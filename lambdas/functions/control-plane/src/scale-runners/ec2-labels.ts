import {
  _InstanceType,
  AcceleratorCountRequest,
  AcceleratorManufacturer,
  AcceleratorName,
  AcceleratorTotalMemoryMiBRequest,
  AcceleratorType,
  BareMetal,
  BaselineEbsBandwidthMbpsRequest,
  BaselinePerformanceFactorsRequest,
  BurstablePerformance,
  CpuManufacturer,
  CpuPerformanceFactorRequest,
  DescribeLaunchTemplateVersionsCommand,
  EC2Client,
  FleetBlockDeviceMappingRequest,
  FleetEbsBlockDeviceRequest,
  InstanceGeneration,
  InstanceRequirementsRequest,
  LocalStorage,
  LocalStorageType,
  MemoryGiBPerVCpuRequest,
  MemoryMiBRequest,
  NetworkBandwidthGbpsRequest,
  NetworkInterfaceCountRequest,
  PerformanceFactorReferenceRequest,
  Placement,
  Tenancy,
  TotalLocalStorageGBRequest,
  VCpuCountRangeRequest,
  VolumeType,
} from '@aws-sdk/client-ec2';
import { getTracedAWSV3Client } from '@aws-github-runner/aws-powertools-util';

import { Ec2OverrideConfig } from './../aws/ec2-runners.d';

const EC2_OVERRIDE_LIST_VALUE_SEPARATOR = ';';

/**
 * Parses EC2 override configuration from GitHub labels.
 *
 * Supported label formats:
 *
 * Basic Fleet Overrides:
 * - ghr-ec2-instance-type:<type>              - Set specific instance type (e.g., c5.xlarge)
 * - ghr-ec2-max-price:<price>                 - Set maximum spot price
 * - ghr-ec2-subnet-id:<id>                    - Set subnet ID
 * - ghr-ec2-availability-zone:<zone>          - Set availability zone
 * - ghr-ec2-availability-zone-id:<id>         - Set availability zone ID
 * - ghr-ec2-weighted-capacity:<number>        - Set weighted capacity
 * - ghr-ec2-priority:<number>                 - Set launch priority
 * - ghr-ec2-image-id:<ami-id>                 - Override AMI ID
 *
 * Instance Requirements (vCPU & Memory):
 * - ghr-ec2-vcpu-count-min:<number>           - Set minimum vCPU count
 * - ghr-ec2-vcpu-count-max:<number>           - Set maximum vCPU count
 * - ghr-ec2-memory-mib-min:<number>           - Set minimum memory in MiB
 * - ghr-ec2-memory-mib-max:<number>           - Set maximum memory in MiB
 * - ghr-ec2-memory-gib-per-vcpu-min:<number>  - Set min memory per vCPU ratio
 * - ghr-ec2-memory-gib-per-vcpu-max:<number>  - Set max memory per vCPU ratio
 *
 * Instance Requirements (CPU & Performance):
 * - ghr-ec2-cpu-manufacturers:<list>          - CPU manufacturers (semicolon-separated: intel;amd;amazon-web-services)
 * - ghr-ec2-instance-generations:<list>       - Instance generations (semicolon-separated: current;previous)
 * - ghr-ec2-excluded-instance-types:<list>    - Exclude instance types (semicolon-separated)
 * - ghr-ec2-allowed-instance-types:<list>     - Allow only specific instance types (semicolon-separated)
 * - ghr-ec2-burstable-performance:<value>     - Burstable performance (included,excluded,required)
 * - ghr-ec2-bare-metal:<value>                - Bare metal (included,excluded,required)
 *
 * Instance Requirements (Accelerators/GPU):
 * - ghr-ec2-accelerator-types:<list>          - Accelerator types (semicolon-separated: gpu;fpga;inference)
 * - ghr-ec2-accelerator-count-min:<num>       - Set minimum accelerator count
 * - ghr-ec2-accelerator-count-max:<num>       - Set maximum accelerator count
 * - ghr-ec2-accelerator-manufacturers:<list>  - Accelerator manufacturers (semicolon-separated: nvidia;amd;amazon-web-services;xilinx)
 * - ghr-ec2-accelerator-names:<list>          - Specific accelerator names (semicolon-separated)
 * - ghr-ec2-accelerator-total-memory-mib-min:<num> - Min accelerator total memory in MiB
 * - ghr-ec2-accelerator-total-memory-mib-max:<num> - Max accelerator total memory in MiB
 *
 * Instance Requirements (Network & Storage):
 * - ghr-ec2-network-interface-count-min:<num> - Min network interfaces
 * - ghr-ec2-network-interface-count-max:<num> - Max network interfaces
 * - ghr-ec2-network-bandwidth-gbps-min:<num>  - Min network bandwidth in Gbps
 * - ghr-ec2-network-bandwidth-gbps-max:<num>  - Max network bandwidth in Gbps
 * - ghr-ec2-local-storage:<value>             - Local storage (included,excluded,required)
 * - ghr-ec2-local-storage-types:<list>        - Local storage types (semicolon-separated: hdd;ssd)
 * - ghr-ec2-total-local-storage-gb-min:<num>  - Min total local storage in GB
 * - ghr-ec2-total-local-storage-gb-max:<num>  - Max total local storage in GB
 * - ghr-ec2-baseline-ebs-bandwidth-mbps-min:<num> - Min baseline EBS bandwidth in Mbps
 * - ghr-ec2-baseline-ebs-bandwidth-mbps-max:<num> - Max baseline EBS bandwidth in Mbps
 *
 * Placement:
 * - ghr-ec2-placement-group-name:<name>       - Placement group name
 * - ghr-ec2-placement-group-id:<id>           - Placement group ID
 * - ghr-ec2-placement-tenancy:<value>         - Tenancy (default,dedicated,host)
 * - ghr-ec2-placement-host-id:<id>            - Dedicated host ID
 * - ghr-ec2-placement-affinity:<value>        - Affinity (default,host)
 * - ghr-ec2-placement-partition-number:<num>  - Partition number
 * - ghr-ec2-placement-availability-zone:<zone> - Placement availability zone
 * - ghr-ec2-placement-availability-zone-id:<id> - Placement availability zone ID
 * - ghr-ec2-placement-spread-domain:<domain>  - Spread domain
 * - ghr-ec2-placement-host-resource-group-arn:<arn> - Host resource group ARN
 *
 * Block Device Mappings:
 * - ghr-ec2-block-device-name:<name>          - Block device name
 * - ghr-ec2-ebs-volume-size:<size>            - EBS volume size in GB
 * - ghr-ec2-ebs-volume-type:<type>            - EBS volume type (gp2,gp3,io1,io2,st1,sc1)
 * - ghr-ec2-ebs-iops:<number>                 - EBS IOPS
 * - ghr-ec2-ebs-throughput:<number>           - EBS throughput in MB/s (gp3 only)
 * - ghr-ec2-ebs-encrypted:<boolean>           - EBS encryption (true,false)
 * - ghr-ec2-ebs-kms-key-id:<id>               - KMS key ID for encryption
 * - ghr-ec2-ebs-delete-on-termination:<bool>  - Delete on termination (true,false)
 * - ghr-ec2-ebs-snapshot-id:<id>              - Snapshot ID for EBS volume
 * - ghr-ec2-block-device-virtual-name:<name>  - Virtual device name (ephemeral storage)
 * - ghr-ec2-block-device-no-device:<string>   - Suppresses device mapping
 *
 * Pricing & Advanced:
 * - ghr-ec2-spot-max-price-percentage-over-lowest-price:<num> - Spot max price as % over lowest price
 * - ghr-ec2-on-demand-max-price-percentage-over-lowest-price:<num> - On-demand max price as % over lowest price
 * - ghr-ec2-max-spot-price-as-percentage-of-optimal-on-demand-price:<num> - Max spot price as % of optimal on-demand
 * - ghr-ec2-require-hibernate-support:<bool>  - Require hibernate support (true,false)
 * - ghr-ec2-require-encryption-in-transit:<bool> - Require encryption in-transit (true,false)
 * - ghr-ec2-baseline-performance-factors-cpu-reference-families:<families> - CPU baseline performance reference families (semicolon-separated)
 *
 * Example:
 *   runs-on: [self-hosted, linux, ghr-ec2-vcpu-count-min:4, ghr-ec2-memory-mib-min:16384, ghr-ec2-accelerator-types:gpu]
 *
 * @param labels - Array of GitHub workflow job labels
 * @param defaultBlockDeviceName - Device name to use when dynamic block device labels create a mapping
 * @returns EC2 override configuration object or undefined if no valid config found
 */
export function parseEc2OverrideConfig(
  labels: string[],
  defaultBlockDeviceName?: string,
): Ec2OverrideConfig | undefined {
  const ec2Labels = labels.filter((l) => l.startsWith('ghr-ec2-'));
  const config: Ec2OverrideConfig = {};

  for (const label of ec2Labels) {
    const [key, ...valueParts] = label.replace('ghr-ec2-', '').split(':');
    const value = valueParts.join(':');

    if (!value) continue;

    // Basic Fleet Overrides
    if (key === 'instance-type') {
      config.InstanceType = value as _InstanceType;
    } else if (key === 'subnet-id') {
      config.SubnetId = value;
    } else if (key === 'availability-zone') {
      config.AvailabilityZone = value;
    } else if (key === 'availability-zone-id') {
      config.AvailabilityZoneId = value;
    } else if (key === 'max-price') {
      config.MaxPrice = value;
    } else if (key === 'priority') {
      config.Priority = parseFloat(value);
    } else if (key === 'weighted-capacity') {
      config.WeightedCapacity = parseFloat(value);
    } else if (key === 'image-id') {
      config.ImageId = value;
    }

    // Placement
    else if (key.startsWith('placement-')) {
      config.Placement = config.Placement || ({} as Placement);
      const placementKey = key.replace('placement-', '');
      if (placementKey === 'availability-zone-id') {
        config.Placement.AvailabilityZoneId = value;
      } else if (placementKey === 'affinity') {
        config.Placement.Affinity = value;
      } else if (placementKey === 'group-name') {
        config.Placement.GroupName = value;
      } else if (placementKey === 'partition-number') {
        config.Placement.PartitionNumber = parseInt(value, 10);
      } else if (placementKey === 'host-id') {
        config.Placement.HostId = value;
      } else if (placementKey === 'tenancy') {
        config.Placement.Tenancy = value as Tenancy;
      } else if (placementKey === 'spread-domain') {
        config.Placement.SpreadDomain = value;
      } else if (placementKey === 'host-resource-group-arn') {
        config.Placement.HostResourceGroupArn = value;
      } else if (placementKey === 'group-id') {
        config.Placement.GroupId = value;
      } else if (placementKey === 'availability-zone') {
        config.Placement.AvailabilityZone = value;
      }
    }

    // Block Device Mappings
    else if (key === 'block-device-name') {
      getOrCreateBlockDeviceMapping(config, defaultBlockDeviceName).DeviceName = value;
    } else if (key === 'block-device-virtual-name') {
      getOrCreateBlockDeviceMapping(config, defaultBlockDeviceName).VirtualName = value;
    } else if (key.startsWith('ebs-')) {
      const blockDeviceMapping = getOrCreateBlockDeviceMapping(config, defaultBlockDeviceName);
      const ebsKey = key.replace('ebs-', '');
      const ebs = blockDeviceMapping.Ebs || (blockDeviceMapping.Ebs = {} as FleetEbsBlockDeviceRequest);

      if (ebsKey === 'encrypted') {
        ebs.Encrypted = value.toLowerCase() === 'true';
      } else if (ebsKey === 'delete-on-termination') {
        ebs.DeleteOnTermination = value.toLowerCase() === 'true';
      } else if (ebsKey === 'iops') {
        ebs.Iops = parseInt(value, 10);
      } else if (ebsKey === 'throughput') {
        ebs.Throughput = parseInt(value, 10);
      } else if (ebsKey === 'kms-key-id') {
        ebs.KmsKeyId = value;
      } else if (ebsKey === 'snapshot-id') {
        ebs.SnapshotId = value;
      } else if (ebsKey === 'volume-size') {
        ebs.VolumeSize = parseInt(value, 10);
      } else if (ebsKey === 'volume-type') {
        ebs.VolumeType = value as VolumeType;
      }
    } else if (key === 'block-device-no-device') {
      getOrCreateBlockDeviceMapping(config, defaultBlockDeviceName).NoDevice = value;
    }

    // Instance Requirements
    else if (key.startsWith('vcpu-count-')) {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.VCpuCount = config.InstanceRequirements.VCpuCount || ({} as VCpuCountRangeRequest);
      const subKey = key.replace('vcpu-count-', '');
      config.InstanceRequirements.VCpuCount![subKey === 'min' ? 'Min' : 'Max'] = parseInt(value, 10);
    } else if (key.startsWith('memory-mib-')) {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.MemoryMiB = config.InstanceRequirements.MemoryMiB || ({} as MemoryMiBRequest);
      const subKey = key.replace('memory-mib-', '');
      config.InstanceRequirements.MemoryMiB![subKey === 'min' ? 'Min' : 'Max'] = parseInt(value, 10);
    } else if (key === 'cpu-manufacturers') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.CpuManufacturers = splitEc2OverrideListValue(value) as CpuManufacturer[];
    } else if (key.startsWith('memory-gib-per-vcpu-')) {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.MemoryGiBPerVCpu =
        config.InstanceRequirements.MemoryGiBPerVCpu || ({} as MemoryGiBPerVCpuRequest);
      const subKey = key.replace('memory-gib-per-vcpu-', '');
      config.InstanceRequirements.MemoryGiBPerVCpu![subKey === 'min' ? 'Min' : 'Max'] = parseFloat(value);
    } else if (key === 'excluded-instance-types') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.ExcludedInstanceTypes = splitEc2OverrideListValue(value);
    } else if (key === 'instance-generations') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.InstanceGenerations = splitEc2OverrideListValue(value) as InstanceGeneration[];
    } else if (key === 'spot-max-price-percentage-over-lowest-price') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.SpotMaxPricePercentageOverLowestPrice = parseInt(value, 10);
    } else if (key === 'on-demand-max-price-percentage-over-lowest-price') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.OnDemandMaxPricePercentageOverLowestPrice = parseInt(value, 10);
    } else if (key === 'bare-metal') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.BareMetal = value as BareMetal;
    } else if (key === 'burstable-performance') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.BurstablePerformance = value as BurstablePerformance;
    } else if (key === 'require-hibernate-support') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.RequireHibernateSupport = value.toLowerCase() === 'true';
    } else if (key.startsWith('network-interface-count-')) {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.NetworkInterfaceCount =
        config.InstanceRequirements.NetworkInterfaceCount || ({} as NetworkInterfaceCountRequest);
      const subKey = key.replace('network-interface-count-', '');
      config.InstanceRequirements.NetworkInterfaceCount![subKey === 'min' ? 'Min' : 'Max'] = parseInt(value, 10);
    } else if (key === 'local-storage') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.LocalStorage = value as LocalStorage;
    } else if (key === 'local-storage-types') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.LocalStorageTypes = splitEc2OverrideListValue(value) as LocalStorageType[];
    } else if (key.startsWith('total-local-storage-gb-')) {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.TotalLocalStorageGB =
        config.InstanceRequirements.TotalLocalStorageGB || ({} as TotalLocalStorageGBRequest);
      const subKey = key.replace('total-local-storage-gb-', '');
      config.InstanceRequirements.TotalLocalStorageGB![subKey === 'min' ? 'Min' : 'Max'] = parseFloat(value);
    } else if (key.startsWith('baseline-ebs-bandwidth-mbps-')) {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.BaselineEbsBandwidthMbps =
        config.InstanceRequirements.BaselineEbsBandwidthMbps || ({} as BaselineEbsBandwidthMbpsRequest);
      const subKey = key.replace('baseline-ebs-bandwidth-mbps-', '');
      config.InstanceRequirements.BaselineEbsBandwidthMbps![subKey === 'min' ? 'Min' : 'Max'] = parseInt(value, 10);
    } else if (key === 'accelerator-types') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.AcceleratorTypes = splitEc2OverrideListValue(value) as AcceleratorType[];
    } else if (key.startsWith('accelerator-count-')) {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.AcceleratorCount =
        config.InstanceRequirements.AcceleratorCount || ({} as AcceleratorCountRequest);
      const subKey = key.replace('accelerator-count-', '');
      config.InstanceRequirements.AcceleratorCount![subKey === 'min' ? 'Min' : 'Max'] = parseInt(value, 10);
    } else if (key === 'accelerator-manufacturers') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.AcceleratorManufacturers = splitEc2OverrideListValue(
        value,
      ) as AcceleratorManufacturer[];
    } else if (key === 'accelerator-names') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.AcceleratorNames = splitEc2OverrideListValue(value) as AcceleratorName[];
    } else if (key.startsWith('accelerator-total-memory-mib-')) {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.AcceleratorTotalMemoryMiB =
        config.InstanceRequirements.AcceleratorTotalMemoryMiB || ({} as AcceleratorTotalMemoryMiBRequest);
      const subKey = key.replace('accelerator-total-memory-mib-', '');
      config.InstanceRequirements.AcceleratorTotalMemoryMiB![subKey === 'min' ? 'Min' : 'Max'] = parseInt(value, 10);
    } else if (key.startsWith('network-bandwidth-gbps-')) {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.NetworkBandwidthGbps =
        config.InstanceRequirements.NetworkBandwidthGbps || ({} as NetworkBandwidthGbpsRequest);
      const subKey = key.replace('network-bandwidth-gbps-', '');
      config.InstanceRequirements.NetworkBandwidthGbps![subKey === 'min' ? 'Min' : 'Max'] = parseFloat(value);
    } else if (key === 'allowed-instance-types') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.AllowedInstanceTypes = splitEc2OverrideListValue(value);
    } else if (key === 'max-spot-price-as-percentage-of-optimal-on-demand-price') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.MaxSpotPriceAsPercentageOfOptimalOnDemandPrice = parseInt(value, 10);
    } else if (key === 'baseline-performance-factors-cpu-reference-families') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.BaselinePerformanceFactors =
        config.InstanceRequirements.BaselinePerformanceFactors || ({} as BaselinePerformanceFactorsRequest);
      config.InstanceRequirements.BaselinePerformanceFactors.Cpu =
        config.InstanceRequirements.BaselinePerformanceFactors.Cpu || ({} as CpuPerformanceFactorRequest);
      config.InstanceRequirements.BaselinePerformanceFactors.Cpu.References = splitEc2OverrideListValue(value).map(
        (family) => ({ InstanceFamily: family }),
      ) as PerformanceFactorReferenceRequest[];
    } else if (key === 'require-encryption-in-transit') {
      config.InstanceRequirements = config.InstanceRequirements || ({} as InstanceRequirementsRequest);
      config.InstanceRequirements.RequireEncryptionInTransit = value.toLowerCase() === 'true';
    }
  }

  return Object.keys(config).length > 0 ? config : undefined;
}

function splitEc2OverrideListValue(value: string): string[] {
  return value.split(EC2_OVERRIDE_LIST_VALUE_SEPARATOR);
}

function getOrCreateBlockDeviceMapping(
  config: Ec2OverrideConfig,
  defaultBlockDeviceName?: string,
): FleetBlockDeviceMappingRequest {
  config.BlockDeviceMappings =
    config.BlockDeviceMappings ||
    ([defaultBlockDeviceName ? { DeviceName: defaultBlockDeviceName } : {}] as FleetBlockDeviceMappingRequest[]);
  return config.BlockDeviceMappings[0];
}

export function shouldLoadLaunchTemplateBlockDeviceName(labels: string[]): boolean {
  const blockDeviceNameLabel = 'ghr-ec2-block-device-name:';
  let hasBlockDeviceOverride = false;
  let hasBlockDeviceName = false;

  for (const label of labels) {
    hasBlockDeviceOverride =
      hasBlockDeviceOverride || label.startsWith('ghr-ec2-ebs-') || label.startsWith('ghr-ec2-block-device-');

    hasBlockDeviceName =
      hasBlockDeviceName || (label.startsWith(blockDeviceNameLabel) && label.slice(blockDeviceNameLabel.length) !== '');
  }

  return hasBlockDeviceOverride && !hasBlockDeviceName;
}

export async function getDefaultBlockDeviceNameFromLaunchTemplate(launchTemplateName: string): Promise<string> {
  const ec2Client = getTracedAWSV3Client(new EC2Client({ region: process.env.AWS_REGION }));
  const launchTemplateVersions = await ec2Client.send(
    new DescribeLaunchTemplateVersionsCommand({
      LaunchTemplateName: launchTemplateName,
      Versions: ['$Default'],
    }),
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
