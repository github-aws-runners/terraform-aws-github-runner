import type { CreateRunnerResult, ListPoolRunnersInput, StandbyReconcileError } from '../../../core';

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
  /** Built from EC2 data when the account is known; bound to the spot request as `ghr:instance-arn`. */
  instanceArn?: string;
  /** The spot request carries `ghr:instance-arn` (D20); only bound spot instances are activated. */
  spotRequestBound?: boolean;
  /** Failed attempts to bind the spot request. */
  spotBindFailures?: number;
  /** ISO-8601 time after which the instance must be destroyed, from `ghr:warm-expires-at`. */
  expiresAt?: string;
  /** Starts that failed for lack of capacity since the instance was primed. */
  startFailures?: number;
}

export type ListStandbyInput = ListPoolRunnersInput;

export interface LaunchStandbyInput extends ListPoolRunnersInput {
  numberOfInstances: number;
  maxAgeHours: number;
  /** Target size of the warm pool; spot placement scores are read for this capacity. */
  poolSize: number;
}

export interface StandbyLaunchResult extends CreateRunnerResult {
  /** Set when the spot placement signals could not be refreshed. */
  placementError?: StandbyReconcileError;
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
  launch(input: LaunchStandbyInput): Promise<StandbyLaunchResult>;
  destroy(instances: DestroyStandbyInput[]): Promise<StandbyBatchResult>;
  /** Cancels each request and terminates its replacement instance, if any. */
  cancelSpotRequests(requests: StandbySpotRequest[]): Promise<StandbyBatchResult>;
  currentImage(): Promise<StandbyImage>;
  /** Marks warm-pool instances that stopped themselves after priming as warm; resolves the IDs that failed. */
  markPrimed(instanceIds: string[]): Promise<string[]>;
}
