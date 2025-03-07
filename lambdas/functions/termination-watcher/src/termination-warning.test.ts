import { EC2Client, Instance } from '@aws-sdk/client-ec2';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { handle } from './termination-warning';
import { SpotInterruptionWarning, SpotTerminationDetail } from './types';
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
  createSpotWarningMetric: true,
  createSpotTerminationMetric: false,
  tagFilters: { 'ghr:environment': 'test' },
  prefix: 'runners',
};

const event: SpotInterruptionWarning<SpotTerminationDetail> = {
  version: '0',
  id: '1',
  'detail-type': 'EC2 Spot Instance Interruption Warning',
  source: 'aws.ec2',
  account: '123456789012',
  time: '2015-11-11T21:29:54Z',
  region: 'us-east-1',
  resources: ['arn:aws:ec2:us-east-1b:instance/i-abcd1111'],
  detail: {
    'instance-id': 'i-abcd1111',
    'instance-action': 'terminate',
  },
};

const instance: Instance = {
  InstanceId: event.detail['instance-id'],
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
    expect(metricEvent).toHaveBeenCalledWith(instance, event, 'SpotInterruptionWarning', expect.anything());
  });

  it('should log details and not create a metric', async () => {
    vi.mocked(getInstances).mockResolvedValue([instance]);

    await handle(event, { ...config, createSpotWarningMetric: false });
    expect(metricEvent).toHaveBeenCalledWith(instance, event, undefined, expect.anything());
  });

  it('should not create a metric if filter not matched.', async () => {
    vi.mocked(getInstances).mockResolvedValue([instance]);

    await handle(event, {
      createSpotWarningMetric: true,
      createSpotTerminationMetric: false,
      tagFilters: { 'ghr:environment': '_NO_MATCH_' },
      prefix: 'runners',
    });

    expect(metricEvent).not.toHaveBeenCalled();
  });
});
