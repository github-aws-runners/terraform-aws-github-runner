import { EventBridgeEvent } from 'aws-lambda';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SpotInterruptionWarning<SpotTerminationDetail>
  extends EventBridgeEvent<'EC2 Spot Instance Interruption Warning', SpotTerminationDetail> {}

interface SpotTerminationDetail {
  'instance-id': string;
  'instance-action': string;
}
