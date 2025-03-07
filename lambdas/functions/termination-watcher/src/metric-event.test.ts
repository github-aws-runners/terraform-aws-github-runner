import { Instance } from '@aws-sdk/client-ec2';
import 'aws-sdk-client-mock-jest';
import { SpotInterruptionWarning, SpotTerminationDetail } from './types';
import { createSingleMetric } from '@aws-github-runner/aws-powertools-util';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { metricEvent } from './metric-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the module before imports
vi.mock('@aws-github-runner/aws-powertools-util', async () => {
  // Use importOriginal instead of requireActual in Vitest
  const actual = (await vi.importActual(
    '@aws-github-runner/aws-powertools-util',
  )) as typeof import('@aws-github-runner/aws-powertools-util');
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    createSingleMetric: vi.fn((name: string, unit: string, value: number, dimensions?: Record<string, string>) => {
      return {
        addMetadata: vi.fn(),
      };
    }),
  };
});

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

describe('create metric and metric logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should log and create a metric', async () => {
    const metricName = 'SpotInterruptionWarning';
    await metricEvent(instance, event, metricName, console);
    expect(createSingleMetric).toHaveBeenCalledTimes(1);
    expect(createSingleMetric).toHaveBeenCalledWith(metricName, MetricUnit.Count, 1, {
      InstanceType: instance.InstanceType ? instance.InstanceType : 'unknown',
      Environment: instance.Tags?.find((tag) => tag.Key === 'ghr:environment')?.Value ?? 'unknown',
    });
  });

  it('should log and create a metric for instance with limited data', async () => {
    const metricName = 'SpotInterruptionWarning';
    const instanceMinimalData: Instance = {
      ...instance,
      InstanceId: undefined,
      InstanceType: undefined,
      LaunchTime: undefined,
      Tags: undefined,
    };

    await metricEvent(instanceMinimalData, event, metricName, console);
    expect(createSingleMetric).toHaveBeenCalledTimes(1);
    expect(createSingleMetric).toHaveBeenCalledWith(metricName, MetricUnit.Count, 1, {
      InstanceType: instanceMinimalData.InstanceType ? instanceMinimalData.InstanceType : 'unknown',
      Environment: instanceMinimalData.Tags?.find((tag) => tag.Key === 'ghr:environment')?.Value ?? 'unknown',
    });
  });

  it('should log and create NOT create a metric', async () => {
    await expect(metricEvent(instance, event, undefined, console)).resolves.not.toThrow();
    expect(createSingleMetric).not.toHaveBeenCalled();
  });
});
