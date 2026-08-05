import {
  DefaultTargetCapacityType,
  FleetOnDemandAllocationStrategy,
  InstanceRequirementsRequest,
  SpotAllocationStrategy,
  _InstanceType,
  Placement,
  FleetBlockDeviceMappingRequest,
} from '@aws-sdk/client-ec2';
import type { LambdaRunnerSource, ListRunnerFilters, RunnerType } from '../../../../core';

export interface Ec2ListRunnerFilters extends ListRunnerFilters {
  statuses?: string[];
}

export interface Ec2OverrideConfig {
  InstanceType?: _InstanceType;
  MaxPrice?: string;
  SubnetId?: string;
  AvailabilityZone?: string;
  WeightedCapacity?: number;
  Priority?: number;
  Placement?: Placement;
  BlockDeviceMappings?: FleetBlockDeviceMappingRequest[];
  InstanceRequirements?: InstanceRequirementsRequest;
  ImageId?: string;
  AvailabilityZoneId?: string;
}

export interface RunnerInputParameters {
  environment: string;
  runnerType: RunnerType;
  runnerOwner: string;
  subnets: string[];
  launchTemplateName: string;
  ec2instanceCriteria: {
    instanceTypes: string[];
    instanceTypePriorities?: Record<string, number>;
    targetCapacityType: DefaultTargetCapacityType;
    maxSpotPrice?: string;
    instanceAllocationStrategy: SpotAllocationStrategy | FleetOnDemandAllocationStrategy;
  };
  ec2OverrideConfig?: Ec2OverrideConfig;
  numberOfRunners: number;
  source: LambdaRunnerSource;
  amiIdSsmParameterName?: string;
  tracingEnabled?: boolean;
  onDemandFailoverOnError?: string[];
  scaleErrors: string[];
  useDedicatedHost?: boolean;
}
