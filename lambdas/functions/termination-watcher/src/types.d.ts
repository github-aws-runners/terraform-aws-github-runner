import { EventBridgeEvent } from 'aws-lambda';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SpotInterruptionWarning<SpotTerminationDetail>
  extends EventBridgeEvent<'EC2 Spot Instance Interruption Warning', SpotTerminationDetail> {}

interface SpotTerminationDetail {
  'instance-id': string;
  'instance-action': string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface BidEvictedEvent<BidEvictedDetail>
  extends EventBridgeEvent<'AWS Service Event via CloudTrail', BidEvictedDetail> {}

interface BidEvictedDetail {
  eventVersion: string;
  userIdentity: UserIdentity;
  eventTime: string;
  eventSource: string;
  eventName: string;
  awsRegion: string;
  sourceIPAddress: string;
  userAgent: string;
  requestParameters: null;
  responseElements: null;
  requestID: string;
  eventID: string;
  readOnly: boolean;
  eventType: string;
  managementEvent: boolean;
  recipientAccountId: string;
  serviceEventDetails: ServiceEventDetails;
  eventCategory: string;
}

interface UserIdentity {
  accountId: string;
  invokedBy: string;
}

interface ServiceEventDetails {
  instanceIdSet: string[];
}
