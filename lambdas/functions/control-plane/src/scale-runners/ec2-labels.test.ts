import { describe, expect, it } from 'vitest';

import { parseEc2OverrideConfig } from './ec2-labels';

describe('parseEc2OverrideConfig', () => {
  describe('Basic Fleet Overrides', () => {
    it('should parse instance-type label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-instance-type:c5.xlarge']);
      expect(result?.InstanceType).toBe('c5.xlarge');
    });

    it('should parse subnet-id label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-subnet-id:subnet-123456']);
      expect(result?.SubnetId).toBe('subnet-123456');
    });

    it('should parse availability-zone label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-availability-zone:us-east-1a']);
      expect(result?.AvailabilityZone).toBe('us-east-1a');
    });

    it('should parse availability-zone-id label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-availability-zone-id:use1-az1']);
      expect(result?.AvailabilityZoneId).toBe('use1-az1');
    });

    it('should parse max-price label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-max-price:0.50']);
      expect(result?.MaxPrice).toBe('0.50');
    });

    it('should parse priority label as number', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-priority:1']);
      expect(result?.Priority).toBe(1);
    });

    it('should parse weighted-capacity label as number', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-weighted-capacity:2']);
      expect(result?.WeightedCapacity).toBe(2);
    });

    it('should parse image-id label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-image-id:ami-12345678']);
      expect(result?.ImageId).toBe('ami-12345678');
    });

    it('should parse multiple basic fleet overrides', () => {
      const result = parseEc2OverrideConfig([
        'ghr-ec2-instance-type:r5.2xlarge',
        'ghr-ec2-max-price:1.00',
        'ghr-ec2-priority:2',
      ]);
      expect(result?.InstanceType).toBe('r5.2xlarge');
      expect(result?.MaxPrice).toBe('1.00');
      expect(result?.Priority).toBe(2);
    });
  });

  describe('Placement', () => {
    it('should parse placement-group-name label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-placement-group-name:my-placement-group']);
      expect(result?.Placement?.GroupName).toBe('my-placement-group');
    });

    it('should parse placement-group-id label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-placement-group-id:pg-1234567890abcdef0']);
      expect(result?.Placement?.GroupId).toBe('pg-1234567890abcdef0');
    });

    it('should parse placement-tenancy label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-placement-tenancy:dedicated']);
      expect(result?.Placement?.Tenancy).toBe('dedicated');
    });

    it('should parse placement-host-id label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-placement-host-id:h-1234567890abcdef']);
      expect(result?.Placement?.HostId).toBe('h-1234567890abcdef');
    });

    it('should parse placement-affinity label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-placement-affinity:host']);
      expect(result?.Placement?.Affinity).toBe('host');
    });

    it('should parse placement-partition-number label as number', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-placement-partition-number:3']);
      expect(result?.Placement?.PartitionNumber).toBe(3);
    });

    it('should parse placement-availability-zone label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-placement-availability-zone:us-west-2b']);
      expect(result?.Placement?.AvailabilityZone).toBe('us-west-2b');
    });

    it('should parse placement-availability-zone-id label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-placement-availability-zone-id:use1-az1']);
      expect(result?.Placement?.AvailabilityZoneId).toBe('use1-az1');
    });

    it('should parse placement-spread-domain label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-placement-spread-domain:my-spread-domain']);
      expect(result?.Placement?.SpreadDomain).toBe('my-spread-domain');
    });

    it('should parse placement-host-resource-group-arn label', () => {
      const result = parseEc2OverrideConfig([
        'ghr-ec2-placement-host-resource-group-arn:arn:aws:ec2:us-east-1:123456789012:host-resource-group/hrg-1234',
      ]);
      expect(result?.Placement?.HostResourceGroupArn).toBe(
        'arn:aws:ec2:us-east-1:123456789012:host-resource-group/hrg-1234',
      );
    });

    it('should parse multiple placement labels', () => {
      const result = parseEc2OverrideConfig([
        'ghr-ec2-placement-group-name:group-1',
        'ghr-ec2-placement-tenancy:dedicated',
        'ghr-ec2-placement-availability-zone:us-east-1b',
      ]);
      expect(result?.Placement?.GroupName).toBe('group-1');
      expect(result?.Placement?.Tenancy).toBe('dedicated');
      expect(result?.Placement?.AvailabilityZone).toBe('us-east-1b');
    });
  });

  describe('Block Device Mappings', () => {
    it('should parse block-device-name label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-block-device-name:/dev/sdg']);
      expect(result?.BlockDeviceMappings?.[0]?.DeviceName).toBe('/dev/sdg');
    });

    it('should use default block device name when provided', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-ebs-volume-size:100'], '/dev/sda1');
      expect(result?.BlockDeviceMappings?.[0]?.DeviceName).toBe('/dev/sda1');
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.VolumeSize).toBe(100);
    });

    it('should parse ebs-volume-size label as number', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-ebs-volume-size:100']);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.VolumeSize).toBe(100);
    });

    it('should parse ebs-volume-type label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-ebs-volume-type:gp3']);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.VolumeType).toBe('gp3');
    });

    it('should parse ebs-iops label as number', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-ebs-iops:3000']);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.Iops).toBe(3000);
    });

    it('should parse ebs-throughput label as number', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-ebs-throughput:250']);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.Throughput).toBe(250);
    });

    it('should parse ebs-encrypted label as boolean true', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-ebs-encrypted:true']);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.Encrypted).toBe(true);
    });

    it('should parse ebs-encrypted label as boolean false', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-ebs-encrypted:false']);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.Encrypted).toBe(false);
    });

    it('should parse ebs-kms-key-id label', () => {
      const result = parseEc2OverrideConfig([
        'ghr-ec2-ebs-kms-key-id:arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
      ]);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.KmsKeyId).toBe(
        'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
      );
    });

    it('should parse ebs-delete-on-termination label as boolean true', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-ebs-delete-on-termination:true']);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.DeleteOnTermination).toBe(true);
    });

    it('should parse ebs-delete-on-termination label as boolean false', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-ebs-delete-on-termination:false']);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.DeleteOnTermination).toBe(false);
    });

    it('should parse ebs-snapshot-id label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-ebs-snapshot-id:snap-1234567890abcdef']);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.SnapshotId).toBe('snap-1234567890abcdef');
    });

    it('should parse block-device-virtual-name label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-block-device-virtual-name:ephemeral0']);
      expect(result?.BlockDeviceMappings?.[0]?.VirtualName).toBe('ephemeral0');
    });

    it('should parse block-device-no-device label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-block-device-no-device:true']);
      expect(result?.BlockDeviceMappings?.[0]?.NoDevice).toBe('true');
    });

    it('should parse multiple block device mapping labels', () => {
      const result = parseEc2OverrideConfig([
        'ghr-ec2-ebs-volume-size:200',
        'ghr-ec2-ebs-volume-type:gp3',
        'ghr-ec2-ebs-iops:5000',
        'ghr-ec2-ebs-encrypted:true',
      ]);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.VolumeSize).toBe(200);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.VolumeType).toBe('gp3');
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.Iops).toBe(5000);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.Encrypted).toBe(true);
    });

    it('should initialize BlockDeviceMappings when not present', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-ebs-volume-size:50']);
      expect(result?.BlockDeviceMappings).toBeDefined();
    });
  });

  describe('Instance Requirements - vCPU and Memory', () => {
    it('should parse vcpu-count-min label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-vcpu-count-min:4']);
      expect(result?.InstanceRequirements?.VCpuCount?.Min).toBe(4);
    });

    it('should parse vcpu-count-max label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-vcpu-count-max:16']);
      expect(result?.InstanceRequirements?.VCpuCount?.Max).toBe(16);
    });

    it('should parse both vcpu-count-min and vcpu-count-max labels', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-vcpu-count-min:2', 'ghr-ec2-vcpu-count-max:8']);
      expect(result?.InstanceRequirements?.VCpuCount?.Min).toBe(2);
      expect(result?.InstanceRequirements?.VCpuCount?.Max).toBe(8);
    });

    it('should parse memory-mib-min label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-memory-mib-min:8192']);
      expect(result?.InstanceRequirements?.MemoryMiB?.Min).toBe(8192);
    });

    it('should parse memory-mib-max label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-memory-mib-max:32768']);
      expect(result?.InstanceRequirements?.MemoryMiB?.Max).toBe(32768);
    });

    it('should parse both memory-mib-min and memory-mib-max labels', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-memory-mib-min:16384', 'ghr-ec2-memory-mib-max:65536']);
      expect(result?.InstanceRequirements?.MemoryMiB?.Min).toBe(16384);
      expect(result?.InstanceRequirements?.MemoryMiB?.Max).toBe(65536);
    });

    it('should parse memory-gib-per-vcpu-min label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-memory-gib-per-vcpu-min:2']);
      expect(result?.InstanceRequirements?.MemoryGiBPerVCpu?.Min).toBe(2);
    });

    it('should parse memory-gib-per-vcpu-max label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-memory-gib-per-vcpu-max:8']);
      expect(result?.InstanceRequirements?.MemoryGiBPerVCpu?.Max).toBe(8);
    });

    it('should parse combined vCPU and memory requirements', () => {
      const result = parseEc2OverrideConfig([
        'ghr-ec2-vcpu-count-min:8',
        'ghr-ec2-vcpu-count-max:32',
        'ghr-ec2-memory-mib-min:32768',
        'ghr-ec2-memory-mib-max:131072',
      ]);
      expect(result?.InstanceRequirements?.VCpuCount?.Min).toBe(8);
      expect(result?.InstanceRequirements?.VCpuCount?.Max).toBe(32);
      expect(result?.InstanceRequirements?.MemoryMiB?.Min).toBe(32768);
      expect(result?.InstanceRequirements?.MemoryMiB?.Max).toBe(131072);
    });
  });

  describe('Instance Requirements - CPU and Performance', () => {
    it('should parse cpu-manufacturers as single value', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-cpu-manufacturers:intel']);
      expect(result?.InstanceRequirements?.CpuManufacturers).toEqual(['intel']);
    });

    it('should parse cpu-manufacturers as semicolon-separated list', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-cpu-manufacturers:intel;amd']);
      expect(result?.InstanceRequirements?.CpuManufacturers).toEqual(['intel', 'amd']);
    });

    it('should parse instance-generations as single value', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-instance-generations:current']);
      expect(result?.InstanceRequirements?.InstanceGenerations).toEqual(['current']);
    });

    it('should parse instance-generations as semicolon-separated list', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-instance-generations:current;previous']);
      expect(result?.InstanceRequirements?.InstanceGenerations).toEqual(['current', 'previous']);
    });

    it('should parse excluded-instance-types as single value', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-excluded-instance-types:t2.micro']);
      expect(result?.InstanceRequirements?.ExcludedInstanceTypes).toEqual(['t2.micro']);
    });

    it('should parse excluded-instance-types as semicolon-separated list', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-excluded-instance-types:t2.micro;t2.small']);
      expect(result?.InstanceRequirements?.ExcludedInstanceTypes).toEqual(['t2.micro', 't2.small']);
    });

    it('should parse allowed-instance-types as single value', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-allowed-instance-types:c5.xlarge']);
      expect(result?.InstanceRequirements?.AllowedInstanceTypes).toEqual(['c5.xlarge']);
    });

    it('should parse allowed-instance-types as semicolon-separated list', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-allowed-instance-types:c5.xlarge;c5.2xlarge']);
      expect(result?.InstanceRequirements?.AllowedInstanceTypes).toEqual(['c5.xlarge', 'c5.2xlarge']);
    });

    it('should parse burstable-performance label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-burstable-performance:included']);
      expect(result?.InstanceRequirements?.BurstablePerformance).toBe('included');
    });

    it('should parse bare-metal label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-bare-metal:excluded']);
      expect(result?.InstanceRequirements?.BareMetal).toBe('excluded');
    });
  });

  describe('Instance Requirements - Accelerators', () => {
    it('should parse accelerator-count-min label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-accelerator-count-min:1']);
      expect(result?.InstanceRequirements?.AcceleratorCount?.Min).toBe(1);
    });

    it('should parse accelerator-count-max label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-accelerator-count-max:4']);
      expect(result?.InstanceRequirements?.AcceleratorCount?.Max).toBe(4);
    });

    it('should parse both accelerator-count-min and accelerator-count-max', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-accelerator-count-min:1', 'ghr-ec2-accelerator-count-max:2']);
      expect(result?.InstanceRequirements?.AcceleratorCount?.Min).toBe(1);
      expect(result?.InstanceRequirements?.AcceleratorCount?.Max).toBe(2);
    });

    it('should parse accelerator-types as single value', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-accelerator-types:gpu']);
      expect(result?.InstanceRequirements?.AcceleratorTypes).toEqual(['gpu']);
    });

    it('should parse accelerator-types as semicolon-separated list', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-accelerator-types:gpu;fpga']);
      expect(result?.InstanceRequirements?.AcceleratorTypes).toEqual(['gpu', 'fpga']);
    });

    it('should parse accelerator-manufacturers as single value', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-accelerator-manufacturers:nvidia']);
      expect(result?.InstanceRequirements?.AcceleratorManufacturers).toEqual(['nvidia']);
    });

    it('should parse accelerator-manufacturers as semicolon-separated list', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-accelerator-manufacturers:nvidia;amd']);
      expect(result?.InstanceRequirements?.AcceleratorManufacturers).toEqual(['nvidia', 'amd']);
    });

    it('should parse accelerator-names as single value', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-accelerator-names:a100']);
      expect(result?.InstanceRequirements?.AcceleratorNames).toEqual(['a100']);
    });

    it('should parse accelerator-names as semicolon-separated list', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-accelerator-names:a100;v100']);
      expect(result?.InstanceRequirements?.AcceleratorNames).toEqual(['a100', 'v100']);
    });

    it('should parse accelerator-total-memory-mib-min label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-accelerator-total-memory-mib-min:8192']);
      expect(result?.InstanceRequirements?.AcceleratorTotalMemoryMiB?.Min).toBe(8192);
    });

    it('should parse accelerator-total-memory-mib-max label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-accelerator-total-memory-mib-max:40960']);
      expect(result?.InstanceRequirements?.AcceleratorTotalMemoryMiB?.Max).toBe(40960);
    });

    it('should parse combined accelerator requirements', () => {
      const result = parseEc2OverrideConfig([
        'ghr-ec2-accelerator-count-min:1',
        'ghr-ec2-accelerator-count-max:2',
        'ghr-ec2-accelerator-types:gpu',
        'ghr-ec2-accelerator-manufacturers:nvidia',
      ]);
      expect(result?.InstanceRequirements?.AcceleratorCount?.Min).toBe(1);
      expect(result?.InstanceRequirements?.AcceleratorCount?.Max).toBe(2);
      expect(result?.InstanceRequirements?.AcceleratorTypes).toEqual(['gpu']);
      expect(result?.InstanceRequirements?.AcceleratorManufacturers).toEqual(['nvidia']);
    });
  });

  describe('Instance Requirements - Network and Storage', () => {
    it('should parse network-interface-count-min label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-network-interface-count-min:2']);
      expect(result?.InstanceRequirements?.NetworkInterfaceCount?.Min).toBe(2);
    });

    it('should parse network-interface-count-max label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-network-interface-count-max:4']);
      expect(result?.InstanceRequirements?.NetworkInterfaceCount?.Max).toBe(4);
    });

    it('should parse network-bandwidth-gbps-min label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-network-bandwidth-gbps-min:5']);
      expect(result?.InstanceRequirements?.NetworkBandwidthGbps?.Min).toBe(5);
    });

    it('should parse network-bandwidth-gbps-max label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-network-bandwidth-gbps-max:25']);
      expect(result?.InstanceRequirements?.NetworkBandwidthGbps?.Max).toBe(25);
    });

    it('should parse local-storage label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-local-storage:included']);
      expect(result?.InstanceRequirements?.LocalStorage).toBe('included');
    });

    it('should parse local-storage-types as single value', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-local-storage-types:ssd']);
      expect(result?.InstanceRequirements?.LocalStorageTypes).toEqual(['ssd']);
    });

    it('should parse local-storage-types as semicolon-separated list', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-local-storage-types:hdd;ssd']);
      expect(result?.InstanceRequirements?.LocalStorageTypes).toEqual(['hdd', 'ssd']);
    });

    it('should parse total-local-storage-gb-min label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-total-local-storage-gb-min:100']);
      expect(result?.InstanceRequirements?.TotalLocalStorageGB?.Min).toBe(100);
    });

    it('should parse total-local-storage-gb-max label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-total-local-storage-gb-max:1000']);
      expect(result?.InstanceRequirements?.TotalLocalStorageGB?.Max).toBe(1000);
    });

    it('should parse baseline-ebs-bandwidth-mbps-min label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-baseline-ebs-bandwidth-mbps-min:500']);
      expect(result?.InstanceRequirements?.BaselineEbsBandwidthMbps?.Min).toBe(500);
    });

    it('should parse baseline-ebs-bandwidth-mbps-max label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-baseline-ebs-bandwidth-mbps-max:2000']);
      expect(result?.InstanceRequirements?.BaselineEbsBandwidthMbps?.Max).toBe(2000);
    });
  });

  describe('Instance Requirements - Pricing and Other', () => {
    it('should parse spot-max-price-percentage-over-lowest-price label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-spot-max-price-percentage-over-lowest-price:50']);
      expect(result?.InstanceRequirements?.SpotMaxPricePercentageOverLowestPrice).toBe(50);
    });

    it('should parse on-demand-max-price-percentage-over-lowest-price label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-on-demand-max-price-percentage-over-lowest-price:75']);
      expect(result?.InstanceRequirements?.OnDemandMaxPricePercentageOverLowestPrice).toBe(75);
    });

    it('should parse max-spot-price-as-percentage-of-optimal-on-demand-price label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-max-spot-price-as-percentage-of-optimal-on-demand-price:60']);
      expect(result?.InstanceRequirements?.MaxSpotPriceAsPercentageOfOptimalOnDemandPrice).toBe(60);
    });

    it('should parse require-hibernate-support label as boolean true', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-require-hibernate-support:true']);
      expect(result?.InstanceRequirements?.RequireHibernateSupport).toBe(true);
    });

    it('should parse require-hibernate-support label as boolean false', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-require-hibernate-support:false']);
      expect(result?.InstanceRequirements?.RequireHibernateSupport).toBe(false);
    });

    it('should parse require-encryption-in-transit label as boolean true', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-require-encryption-in-transit:true']);
      expect(result?.InstanceRequirements?.RequireEncryptionInTransit).toBe(true);
    });

    it('should parse require-encryption-in-transit label as boolean false', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-require-encryption-in-transit:false']);
      expect(result?.InstanceRequirements?.RequireEncryptionInTransit).toBe(false);
    });

    it('should parse baseline-performance-factors-cpu-reference-families label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-baseline-performance-factors-cpu-reference-families:intel']);
      expect(result?.InstanceRequirements?.BaselinePerformanceFactors?.Cpu?.References?.[0]?.InstanceFamily).toBe(
        'intel',
      );
    });
    it('should parse baseline-performance-factors-cpu-reference-families list label', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-baseline-performance-factors-cpu-reference-families:intel;amd']);
      expect(result?.InstanceRequirements?.BaselinePerformanceFactors?.Cpu?.References?.[0]?.InstanceFamily).toBe(
        'intel',
      );
      expect(result?.InstanceRequirements?.BaselinePerformanceFactors?.Cpu?.References?.[1]?.InstanceFamily).toBe(
        'amd',
      );
    });
  });

  describe('Edge Cases', () => {
    it('should return undefined when empty array is provided', () => {
      const result = parseEc2OverrideConfig([]);
      expect(result).toBeUndefined();
    });

    it('should return undefined when no ghr-ec2 labels are provided', () => {
      const result = parseEc2OverrideConfig(['self-hosted', 'linux', 'x64']);
      expect(result).toBeUndefined();
    });

    it('should ignore non-ghr-ec2 labels and only parse ghr-ec2 labels', () => {
      const result = parseEc2OverrideConfig([
        'self-hosted',
        'ghr-ec2-instance-type:m5.large',
        'linux',
        'ghr-ec2-max-price:0.30',
      ]);
      expect(result?.InstanceType).toBe('m5.large');
      expect(result?.MaxPrice).toBe('0.30');
    });

    it('should handle labels with colons in values (ARNs)', () => {
      const result = parseEc2OverrideConfig([
        'ghr-ec2-ebs-kms-key-id:arn:aws:kms:us-east-1:123456789012:key/abc-def-ghi',
      ]);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.KmsKeyId).toBe(
        'arn:aws:kms:us-east-1:123456789012:key/abc-def-ghi',
      );
    });

    it('should handle labels with colons in placement ARNs', () => {
      const result = parseEc2OverrideConfig([
        'ghr-ec2-placement-host-resource-group-arn:arn:aws:ec2:us-west-2:123456789012:host-resource-group/hrg-abc123',
      ]);
      expect(result?.Placement?.HostResourceGroupArn).toBe(
        'arn:aws:ec2:us-west-2:123456789012:host-resource-group/hrg-abc123',
      );
    });

    it('should handle labels without values gracefully', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-instance-type:', 'ghr-ec2-max-price:0.50']);
      expect(result?.InstanceType).toBeUndefined();
      expect(result?.MaxPrice).toBe('0.50');
    });

    it('should handle malformed labels (no colon) gracefully', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-instance-type-m5-large', 'ghr-ec2-max-price:0.50']);
      expect(result?.MaxPrice).toBe('0.50');
      expect(result?.InstanceType).toBeUndefined();
    });

    it('should handle numeric strings correctly for number fields', () => {
      const result = parseEc2OverrideConfig([
        'ghr-ec2-priority:5',
        'ghr-ec2-weighted-capacity:10',
        'ghr-ec2-vcpu-count-min:4',
      ]);
      expect(result?.Priority).toBe(5);
      expect(result?.WeightedCapacity).toBe(10);
      expect(result?.InstanceRequirements?.VCpuCount?.Min).toBe(4);
    });

    it('should handle boolean strings correctly for boolean fields', () => {
      const result = parseEc2OverrideConfig([
        'ghr-ec2-ebs-encrypted:true',
        'ghr-ec2-ebs-delete-on-termination:false',
        'ghr-ec2-require-hibernate-support:true',
      ]);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.Encrypted).toBe(true);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.DeleteOnTermination).toBe(false);
      expect(result?.InstanceRequirements?.RequireHibernateSupport).toBe(true);
    });

    it('should handle floating point numbers in max-price', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-max-price:0.12345']);
      expect(result?.MaxPrice).toBe('0.12345');
    });

    it('should handle whitespace in semicolon-separated lists', () => {
      const result = parseEc2OverrideConfig(['ghr-ec2-cpu-manufacturers: intel ; amd ']);
      expect(result?.InstanceRequirements?.CpuManufacturers).toEqual([' intel ', ' amd ']);
    });

    it('should return config with all parsed labels', () => {
      const result = parseEc2OverrideConfig([
        'ghr-ec2-instance-type:c5.xlarge',
        'ghr-ec2-vcpu-count-min:4',
        'ghr-ec2-memory-mib-min:8192',
        'ghr-ec2-placement-tenancy:dedicated',
        'ghr-ec2-ebs-volume-size:100',
      ]);
      expect(result?.InstanceType).toBe('c5.xlarge');
      expect(result?.InstanceRequirements?.VCpuCount?.Min).toBe(4);
      expect(result?.InstanceRequirements?.MemoryMiB?.Min).toBe(8192);
      expect(result?.Placement?.Tenancy).toBe('dedicated');
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.VolumeSize).toBe(100);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle comprehensive EC2 configuration with all categories', () => {
      const result = parseEc2OverrideConfig([
        // Basic Fleet
        'ghr-ec2-instance-type:r5.2xlarge',
        'ghr-ec2-max-price:0.75',
        'ghr-ec2-priority:1',
        // Placement
        'ghr-ec2-placement-group-name:my-group',
        'ghr-ec2-placement-tenancy:dedicated',
        // Block Device
        'ghr-ec2-ebs-volume-size:200',
        'ghr-ec2-ebs-volume-type:gp3',
        'ghr-ec2-ebs-encrypted:true',
        // Instance Requirements
        'ghr-ec2-vcpu-count-min:8',
        'ghr-ec2-vcpu-count-max:32',
        'ghr-ec2-memory-mib-min:32768',
        'ghr-ec2-cpu-manufacturers:intel;amd',
        'ghr-ec2-instance-generations:current',
      ]);

      expect(result?.InstanceType).toBe('r5.2xlarge');
      expect(result?.MaxPrice).toBe('0.75');
      expect(result?.Priority).toBe(1);
      expect(result?.Placement?.GroupName).toBe('my-group');
      expect(result?.Placement?.Tenancy).toBe('dedicated');
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.VolumeSize).toBe(200);
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.VolumeType).toBe('gp3');
      expect(result?.BlockDeviceMappings?.[0]?.Ebs?.Encrypted).toBe(true);
      expect(result?.InstanceRequirements?.VCpuCount?.Min).toBe(8);
      expect(result?.InstanceRequirements?.VCpuCount?.Max).toBe(32);
      expect(result?.InstanceRequirements?.MemoryMiB?.Min).toBe(32768);
      expect(result?.InstanceRequirements?.CpuManufacturers).toEqual(['intel', 'amd']);
      expect(result?.InstanceRequirements?.InstanceGenerations).toEqual(['current']);
    });

    it('should handle GPU instance configuration', () => {
      const result = parseEc2OverrideConfig([
        'ghr-ec2-accelerator-count-min:1',
        'ghr-ec2-accelerator-count-max:4',
        'ghr-ec2-accelerator-types:gpu',
        'ghr-ec2-accelerator-manufacturers:nvidia',
        'ghr-ec2-accelerator-names:a100;v100',
        'ghr-ec2-accelerator-total-memory-mib-min:16384',
      ]);

      expect(result?.InstanceRequirements?.AcceleratorCount?.Min).toBe(1);
      expect(result?.InstanceRequirements?.AcceleratorCount?.Max).toBe(4);
      expect(result?.InstanceRequirements?.AcceleratorTypes).toEqual(['gpu']);
      expect(result?.InstanceRequirements?.AcceleratorManufacturers).toEqual(['nvidia']);
      expect(result?.InstanceRequirements?.AcceleratorNames).toEqual(['a100', 'v100']);
      expect(result?.InstanceRequirements?.AcceleratorTotalMemoryMiB?.Min).toBe(16384);
    });

    it('should handle network-optimized instance configuration', () => {
      const result = parseEc2OverrideConfig([
        'ghr-ec2-network-interface-count-min:2',
        'ghr-ec2-network-interface-count-max:8',
        'ghr-ec2-network-bandwidth-gbps-min:10',
        'ghr-ec2-network-bandwidth-gbps-max:100',
        'ghr-ec2-baseline-ebs-bandwidth-mbps-min:1000',
      ]);

      expect(result?.InstanceRequirements?.NetworkInterfaceCount?.Min).toBe(2);
      expect(result?.InstanceRequirements?.NetworkInterfaceCount?.Max).toBe(8);
      expect(result?.InstanceRequirements?.NetworkBandwidthGbps?.Min).toBe(10);
      expect(result?.InstanceRequirements?.NetworkBandwidthGbps?.Max).toBe(100);
      expect(result?.InstanceRequirements?.BaselineEbsBandwidthMbps?.Min).toBe(1000);
    });

    it('should handle storage-optimized instance configuration', () => {
      const result = parseEc2OverrideConfig([
        'ghr-ec2-local-storage:included',
        'ghr-ec2-local-storage-types:ssd',
        'ghr-ec2-total-local-storage-gb-min:500',
        'ghr-ec2-total-local-storage-gb-max:2000',
      ]);

      expect(result?.InstanceRequirements?.LocalStorage).toBe('included');
      expect(result?.InstanceRequirements?.LocalStorageTypes).toEqual(['ssd']);
      expect(result?.InstanceRequirements?.TotalLocalStorageGB?.Min).toBe(500);
      expect(result?.InstanceRequirements?.TotalLocalStorageGB?.Max).toBe(2000);
    });

    it('should handle spot instance configuration with pricing', () => {
      const result = parseEc2OverrideConfig([
        'ghr-ec2-max-price:0.50',
        'ghr-ec2-spot-max-price-percentage-over-lowest-price:100',
        'ghr-ec2-on-demand-max-price-percentage-over-lowest-price:150',
      ]);

      expect(result?.MaxPrice).toBe('0.50');
      expect(result?.InstanceRequirements?.SpotMaxPricePercentageOverLowestPrice).toBe(100);
      expect(result?.InstanceRequirements?.OnDemandMaxPricePercentageOverLowestPrice).toBe(150);
    });
  });
});
