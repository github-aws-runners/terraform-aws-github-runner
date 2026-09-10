import { EC2Client, Instance } from '@aws-sdk/client-ec2';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { handle } from './termination-warning';
import { SpotInterruptionWarning, SpotTerminationDetail, InstanceStateChangeEvent } from './types';
import { metricEvent } from './metric-event';
import { deregisterRunner } from './deregister';

import { getInstances } from './ec2';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./metric-event', () => ({
  metricEvent: vi.fn(),
}));

vi.mock('./deregister', () => ({
  deregisterRunner: vi.fn(),
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
  enableRunnerDeregistration: true,
  ghesApiUrl: '',
};

const spotEvent: SpotInterruptionWarning<SpotTerminationDetail> = {
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

const stateChangeEvent: InstanceStateChangeEvent = {
  version: '0',
  id: '2',
  'detail-type': 'EC2 Instance State-change Notification',
  source: 'aws.ec2',
  account: '123456789012',
  time: '2015-11-11T21:30:00Z',
  region: 'us-east-1',
  resources: ['arn:aws:ec2:us-east-1b:instance/i-abcd1111'],
  detail: {
    'instance-id': 'i-abcd1111',
    state: 'shutting-down',
  },
};

const instance: Instance = {
  InstanceId: 'i-abcd1111',
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

  it('should emit metric for spot interruption events', async () => {
    vi.mocked(getInstances).mockResolvedValue([instance]);
    await handle(spotEvent, config);

    expect(metricEvent).toHaveBeenCalledWith(instance, spotEvent, 'SpotInterruptionWarning', expect.anything());
    expect(deregisterRunner).toHaveBeenCalledWith(instance, config);
  });

  it('should not emit metric when createSpotWarningMetric is false', async () => {
    vi.mocked(getInstances).mockResolvedValue([instance]);

    const noMetricConfig = { ...config, createSpotWarningMetric: false };
    await handle(spotEvent, noMetricConfig);
    expect(metricEvent).toHaveBeenCalledWith(instance, spotEvent, undefined, expect.anything());
    expect(deregisterRunner).toHaveBeenCalledWith(instance, noMetricConfig);
  });

  it('should not emit metric or deregister if filter not matched', async () => {
    vi.mocked(getInstances).mockResolvedValue([instance]);

    await handle(spotEvent, {
      createSpotWarningMetric: true,
      createSpotTerminationMetric: false,
      tagFilters: { 'ghr:environment': '_NO_MATCH_' },
      prefix: 'runners',
      enableRunnerDeregistration: true,
      ghesApiUrl: '',
    });

    expect(metricEvent).not.toHaveBeenCalled();
    expect(deregisterRunner).not.toHaveBeenCalled();
  });

  it('should not emit metric for instance state-change events but still deregister', async () => {
    vi.mocked(getInstances).mockResolvedValue([instance]);

    await handle(stateChangeEvent, config);

    expect(metricEvent).toHaveBeenCalledWith(instance, stateChangeEvent, undefined, expect.anything());
    expect(deregisterRunner).toHaveBeenCalledWith(instance, config);
  });
});
