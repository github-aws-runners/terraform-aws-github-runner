import { EventBridgeEvent } from 'aws-lambda';

export interface SpotInterruptionWarning<SpotTerminationDetail>
  extends EventBridgeEvent<'EC2 Spot Instance Interruption Warning', SpotTerminationDetail> {}

interface SpotTerminationDetail {
  'instance-id': string;
  'instance-action': string;
}
