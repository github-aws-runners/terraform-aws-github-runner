import { EC2Client, Instance } from '@aws-sdk/client-ec2';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { handle } from './termination';
import { BidEvictedDetail, BidEvictedEvent } from './types';
import { metricEvent } from './metric-event';

import { getInstances } from './ec2';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./metric-event', () => ({
  metricEvent: vi.fn(),
}));

vi.mock('./ec2', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getInstances: vi.fn(),
  };
});

mockClient(EC2Client);

const config = {
  createSpotWarningMetric: false,
  createSpotTerminationMetric: true,
  tagFilters: { 'ghr:environment': 'test' },
  prefix: 'runners',
};

const event: BidEvictedEvent<BidEvictedDetail> = {
  version: '0',
  id: '186d7999-3121-e749-23f3-c7caec1084e1',
  'detail-type': 'AWS Service Event via CloudTrail',
  source: 'aws.ec2',
  account: '123456789012',
  time: '2024-10-09T11:48:46Z',
  region: 'eu-west-1',
  resources: [],
  detail: {
    eventVersion: '1.10',
    userIdentity: {
      accountId: '123456789012',
      invokedBy: 'sec2.amazonaws.com',
    },
    eventTime: '2024-10-09T11:48:46Z',
    eventSource: 'ec2.amazonaws.com',
    eventName: 'BidEvictedEvent',
    awsRegion: 'eu-west-1',
    sourceIPAddress: 'ec2.amazonaws.com',
    userAgent: 'ec2.amazonaws.com',
    requestParameters: null,
    responseElements: null,
    requestID: 'ebf032e3-5009-3484-aae8-b4946ab2e2eb',
    eventID: '3a15843b-96c2-41b1-aac1-7d62dc754547',
    readOnly: false,
    eventType: 'AwsServiceEvent',
    managementEvent: true,
    recipientAccountId: '123456789012',
    serviceEventDetails: {
      instanceIdSet: ['i-12345678901234567'],
    },
    eventCategory: 'Management',
  },
};

const instance: Instance = {
  InstanceId: event.detail.serviceEventDetails.instanceIdSet[0],
  InstanceType: 't2.micro',
  Tags: [
    { Key: 'Name', Value: 'test-instance' },
    { Key: 'ghr:environment', Value: 'test' },
    { Key: 'ghr:created_by', Value: 'niek' },
  ],
  State: { Name: 'running' },
  LaunchTime: new Date('2021-01-01'),
};

describe('handle termination warning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should log and create an metric', async () => {
    vi.mocked(getInstances).mockResolvedValue([instance]);
    await handle(event, config);

    expect(metricEvent).toHaveBeenCalled();
    expect(metricEvent).toHaveBeenCalledWith(instance, event, 'SpotTermination', expect.anything());
  });

  it('should log details and not create a metric', async () => {
    vi.mocked(getInstances).mockResolvedValue([instance]);

    await handle(event, { ...config, createSpotTerminationMetric: false });
    expect(metricEvent).toHaveBeenCalledWith(instance, event, undefined, expect.anything());
  });

  it('should not create a metric if filter not matched.', async () => {
    vi.mocked(getInstances).mockResolvedValue([instance]);

    await handle(event, {
      createSpotWarningMetric: false,
      createSpotTerminationMetric: true,
      tagFilters: { 'ghr:environment': '_NO_MATCH_' },
      prefix: 'runners',
    });

    expect(metricEvent).not.toHaveBeenCalled();
  });
});
