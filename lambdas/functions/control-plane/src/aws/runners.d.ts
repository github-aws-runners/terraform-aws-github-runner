import { DefaultTargetCapacityType, SpotAllocationStrategy, Tag } from '@aws-sdk/client-ec2';

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
  tags?: Tag[];
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
  standby?: boolean;
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
  numberOfRunners: number;
  amiIdSsmParameterName?: string;
  tracingEnabled?: boolean;
  onDemandFailoverOnError?: string[];
}
