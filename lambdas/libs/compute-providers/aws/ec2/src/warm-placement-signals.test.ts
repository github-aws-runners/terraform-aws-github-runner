import {
  DescribeSpotPriceHistoryCommand,
  DescribeSubnetsCommand,
  EC2Client,
  GetSpotPlacementScoresCommand,
} from '@aws-sdk/client-ec2';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';
import { beforeEach, describe, expect, it } from 'vitest';

import { ec2SdkError } from '../../../test/aws-sdk-errors';
import { awsErrorCode } from './runners';
import { createEc2PlacementSignalClient } from './warm-placement-signals';

const mockEC2Client = mockClient(EC2Client);
const signals = createEc2PlacementSignalClient(new EC2Client({})).forRequest({ signal: undefined });

beforeEach(() => {
  mockEC2Client.reset();
});

describe('describeSubnetAzIds', () => {
  it('maps the subnets to their AZ IDs', async () => {
    mockEC2Client.on(DescribeSubnetsCommand).resolves({
      Subnets: [
        { SubnetId: 'subnet-a', AvailabilityZoneId: 'euw1-az1' },
        { SubnetId: 'subnet-b', AvailabilityZoneId: 'euw1-az2' },
        { SubnetId: 'subnet-c' },
      ],
    });

    await expect(signals.describeSubnetAzIds(['subnet-a', 'subnet-b', 'subnet-c'])).resolves.toEqual({
      'subnet-a': 'euw1-az1',
      'subnet-b': 'euw1-az2',
    });
    expect(mockEC2Client).toHaveReceivedCommandWith(DescribeSubnetsCommand, {
      SubnetIds: ['subnet-a', 'subnet-b', 'subnet-c'],
    });
  });
});

describe('getSpotPlacementScores', () => {
  it('reads single-AZ scores for the region across pages', async () => {
    mockEC2Client
      .on(GetSpotPlacementScoresCommand)
      .resolvesOnce({ SpotPlacementScores: [{ AvailabilityZoneId: 'euw1-az1', Score: 9 }], NextToken: 'next' })
      .resolvesOnce({ SpotPlacementScores: [{ AvailabilityZoneId: 'euw1-az2', Score: 3 }, { Score: 5 }] });

    await expect(
      signals.getSpotPlacementScores({
        instanceTypes: ['m7g.large', 'c7g.large', 'r7g.large'],
        targetCapacity: 6,
        region: 'eu-west-1',
      }),
    ).resolves.toEqual({ 'euw1-az1': 9, 'euw1-az2': 3 });
    expect(mockEC2Client).toHaveReceivedCommandWith(GetSpotPlacementScoresCommand, {
      InstanceTypes: ['m7g.large', 'c7g.large', 'r7g.large'],
      TargetCapacity: 6,
      SingleAvailabilityZone: true,
      RegionNames: ['eu-west-1'],
    });
    expect(mockEC2Client).toHaveReceivedNthCommandWith(2, GetSpotPlacementScoresCommand, { NextToken: 'next' });
  });

  it('asks for at least one instance of capacity', async () => {
    mockEC2Client.on(GetSpotPlacementScoresCommand).resolves({});

    await signals.getSpotPlacementScores({ instanceTypes: ['m7g.large'], targetCapacity: 0, region: 'eu-west-1' });

    expect(mockEC2Client).toHaveReceivedCommandWith(GetSpotPlacementScoresCommand, { TargetCapacity: 1 });
  });

  it('surfaces the AWS error code of a failed lookup', async () => {
    mockEC2Client.on(GetSpotPlacementScoresCommand).rejects(await ec2SdkError('UnauthorizedOperation'));

    const error = await signals
      .getSpotPlacementScores({ instanceTypes: ['m7g.large'], targetCapacity: 1, region: 'eu-west-1' })
      .catch((caught: unknown) => caught);

    expect(awsErrorCode(error)).toBe('UnauthorizedOperation');
  });
});

describe('getSpotPrices', () => {
  it('keeps the newest price of each type and AZ across pages', async () => {
    mockEC2Client
      .on(DescribeSpotPriceHistoryCommand)
      .resolvesOnce({
        SpotPriceHistory: [
          { InstanceType: 'm7g.large', AvailabilityZoneId: 'euw1-az1', SpotPrice: '0.0310' },
          { InstanceType: 'm7g.large', AvailabilityZoneId: 'euw1-az1', SpotPrice: '0.0500' },
        ],
        NextToken: 'next',
      })
      .resolvesOnce({
        SpotPriceHistory: [
          { InstanceType: 'c7g.large', AvailabilityZoneId: 'euw1-az2', SpotPrice: '0.0280' },
          { InstanceType: 'c7g.large', AvailabilityZoneId: 'euw1-az3', SpotPrice: 'n/a' },
        ],
        NextToken: '',
      });

    await expect(
      signals.getSpotPrices({ instanceTypes: ['m7g.large', 'c7g.large'], productDescription: 'Linux/UNIX' }),
    ).resolves.toEqual({ 'm7g.large|euw1-az1': 0.031, 'c7g.large|euw1-az2': 0.028 });
    expect(mockEC2Client).toHaveReceivedCommandTimes(DescribeSpotPriceHistoryCommand, 2);
    expect(mockEC2Client).toHaveReceivedCommandWith(DescribeSpotPriceHistoryCommand, {
      InstanceTypes: ['m7g.large', 'c7g.large'],
      ProductDescriptions: ['Linux/UNIX'],
    });
  });
});
