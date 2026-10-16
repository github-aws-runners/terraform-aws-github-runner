import type { CreateRunnerResult, ListPoolRunnersInput } from '../../../core';

export type StandbyInstanceState = 'PRIMING' | 'WARM' | 'ACTIVE' | 'GARBAGE';

export interface StandbyInstance {
  instanceId: string;
  state: StandbyInstanceState;
  launchTime?: Date;
  imageId?: string;
  launchTemplateVersion?: string;
  instanceType?: string;
  availabilityZone?: string;
  spotInstanceRequestId?: string;
  /** ISO-8601 time after which the instance must be destroyed, from `ghr:warm-expires-at`. */
  expiresAt?: string;
  /** Starts that failed for lack of capacity since the instance was primed. */
  startFailures?: number;
}

export type ListStandbyInput = ListPoolRunnersInput;

export interface LaunchStandbyInput extends ListPoolRunnersInput {
  numberOfInstances: number;
  maxAgeHours: number;
}

export type DestroyStandbyInput = Pick<StandbyInstance, 'instanceId' | 'spotInstanceRequestId'>;

export interface StandbySpotRequest {
  spotInstanceRequestId: string;
  state?: string;
  instanceId?: string;
  /** Instance AWS launched for the request after its standby instance went away. */
  replacementInstanceId?: string;
}

export interface StandbyListing {
  instances: StandbyInstance[];
  /** Live spot requests of standby instances that are gone, or that were activated and not detached. */
  orphanedSpotRequests: StandbySpotRequest[];
  /** Set when spot request state could not be read; stopped spot instances are then classified from EC2 data. */
  spotLookupError?: string;
}

export interface StandbyBatchResult {
  succeeded: string[];
  failed: string[];
}

/** Image new standby instances would launch with; undefined fields could not be determined. */
export interface StandbyImage {
  imageId?: string;
  launchTemplateVersion?: string;
}

export interface Ec2PoolStandbyOperations {
  list(input: ListStandbyInput): Promise<StandbyListing>;
  launch(input: LaunchStandbyInput): Promise<CreateRunnerResult>;
  destroy(instances: DestroyStandbyInput[]): Promise<StandbyBatchResult>;
  /** Cancels each request and terminates its replacement instance, if any. */
  cancelSpotRequests(requests: StandbySpotRequest[]): Promise<StandbyBatchResult>;
  currentImage(): Promise<StandbyImage>;
  /** Marks warm-pool instances that stopped themselves after priming as warm; resolves the IDs that failed. */
  markPrimed(instanceIds: string[]): Promise<string[]>;
}
