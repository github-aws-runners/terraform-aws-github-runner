import { DescribeInstancesCommand, EC2Client, Instance, Reservation } from '@aws-sdk/client-ec2';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { handle } from './termination-warning';
import { SpotInterruptionWarning, SpotTerminationDetail } from './types';
import { createSingleMetric } from '@terraform-aws-github-runner/aws-powertools-util';
import { MetricUnits } from '@aws-lambda-powertools/metrics';

jest.mock('@terraform-aws-github-runner/aws-powertools-util', () => ({
  ...jest.requireActual('@terraform-aws-github-runner/aws-powertools-util'),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createSingleMetric: jest.fn((name: string, unit: string, value: number, dimensions?: Record<string, string>) => {
    return {
      addMetadata: jest.fn(),
    };
  }),
}));

const mockEC2Client = mockClient(EC2Client);

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

const reservations: Reservation[] = [
  {
    Instances: [instance],
  },
];

describe('handle termination warning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    //jest.restoreAllMocks();
  });

  it('should log and create an metric', async () => {
    mockEC2Client.on(DescribeInstancesCommand).resolves({ Reservations: reservations });

    await handle(event, { createMetrics: true });
    expect(createSingleMetric).toHaveBeenCalled();
    expect(createSingleMetric).toHaveBeenCalledWith('SpotInterruptionWarning', MetricUnits.Count, 1, {
      InstanceType: instance.InstanceType ? instance.InstanceType : '_FAIL_',
      Environment: instance.Tags?.find((tag) => tag.Key === 'ghr:environment')?.Value ?? '_FAIL_',
    });
  });

  it('should log details and not create a metric', async () => {
    mockEC2Client.on(DescribeInstancesCommand).resolves({ Reservations: reservations });

    await handle(event, { createMetrics: false });
    expect(createSingleMetric).not.toHaveBeenCalled();
  });

  it('should log ec2 instance details 2', async () => {
    mockEC2Client.on(DescribeInstancesCommand).resolves({
      Reservations: [
        {
          Instances: [
            {
              ...instance,
              InstanceType: undefined,
              LaunchTime: undefined,
              InstanceId: undefined,
              Tags: [{ Key: 'ghr:created_by', Value: 'niek' }],
            },
          ],
        },
      ],
    });

    await handle(event, { createMetrics: true });
    expect(createSingleMetric).toHaveBeenCalled();
  });

  it('should log ec2 instance details 3', async () => {
    mockEC2Client.on(DescribeInstancesCommand).resolves({
      Reservations: [
        {
          Instances: [],
        },
      ],
    });

    await handle(event, { createMetrics: true });
    expect(createSingleMetric).not.toHaveBeenCalled();
  });
});
