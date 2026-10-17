import type { ListPoolRunnersInput } from '../../../core';

export type StandbyInstanceState = 'PRIMING' | 'WARM' | 'ACTIVE' | 'GARBAGE';

export interface StandbyInstance {
  instanceId: string;
  state: StandbyInstanceState;
  launchTime?: Date;
  imageId?: string;
  launchTemplateVersion?: string;
  spotInstanceRequestId?: string;
  /** ISO-8601 time after which the instance must be destroyed, from `ghr:warm-expires-at`. */
  expiresAt?: string;
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
