import { DefaultTargetCapacityType, InstanceRequirementsRequest, SpotAllocationStrategy, _InstanceType, Placement, FleetBlockDeviceMappingRequest } from '@aws-sdk/client-ec2';

export type RunnerType = 'Org' | 'Repo';

export interface RunnerList {
  instanceId: string;
  launchTime?: Date;
  owner?: string;
  type?: string;
  repo?: string;
  org?: string;
  orphan?: boolean;
  runnerId?: string;
  bypassRemoval?: boolean;
}

export interface RunnerInfo {
  instanceId: string;
  launchTime?: Date;
  owner: string;
  type: string;
}

export interface ListRunnerFilters {
  runnerType?: RunnerType;
  runnerOwner?: string;
  environment?: string;
  orphan?: boolean;
  statuses?: string[];
}

export interface Ec2OverrideConfig {
  InstanceType?: _InstanceType
  MaxPrice?: string
  SubnetId?: string
  AvailabilityZone?: string
  WeightedCapacity?: number
  Priority?: number
  Placement?: Placement
  BlockDeviceMappings?: FleetBlockDeviceMappingRequest[]
  InstanceRequirements?: InstanceRequirementsRequest
  ImageId?: string
  AvailabilityZoneId?: string
}

export interface RunnerInputParameters {
  environment: string;
  runnerType: RunnerType;
  runnerOwner: string;
  subnets: string[];
  launchTemplateName: string;
  ec2instanceCriteria: {
    instanceTypes: string[];
    targetCapacityType: DefaultTargetCapacityType;
    maxSpotPrice?: string;
    instanceAllocationStrategy: SpotAllocationStrategy;
  };
  ec2OverrideConfig?: Ec2OverrideConfig;
  numberOfRunners: number;
  amiIdSsmParameterName?: string;
  tracingEnabled?: boolean;
  onDemandFailoverOnError?: string[];
  scaleErrors: string[];
}
