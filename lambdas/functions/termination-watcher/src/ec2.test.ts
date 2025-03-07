import { EC2Client, DescribeInstancesCommand, DescribeInstancesResult } from '@aws-sdk/client-ec2';
import { mockClient } from 'aws-sdk-client-mock';
import { getInstances, tagFilter } from './ec2';
import { describe, it, expect, beforeEach } from 'vitest';

const ec2Mock = mockClient(EC2Client);

describe('getInstances', () => {
  beforeEach(() => {
    ec2Mock.reset();
  });

  it('should return the instance when found', async () => {
    const instanceId = 'i-1234567890abcdef0';
    const instance = { InstanceId: instanceId };
    ec2Mock.on(DescribeInstancesCommand).resolves({
      Reservations: [{ Instances: [instance] }],
    });

    const result = await getInstances(new EC2Client({}), [instanceId]);
    expect(result).toEqual([instance]);
  });

  describe('should return null when the instance is not found', () => {
    it.each([{ Reservations: [] }, {}, { Reservations: undefined }])(
      'with %p',
      async (item: DescribeInstancesResult) => {
        const instanceId = 'i-1234567890abcdef0';
        ec2Mock.on(DescribeInstancesCommand).resolves(item);

        const result = await getInstances(new EC2Client({}), [instanceId]);
        expect(result).toEqual([]);
      },
    );
  });
});

describe('tagFilter', () => {
  describe('should return true when the instance matches the tag filters', () => {
    it.each([{ Environment: 'production' }, { Environment: 'prod' }])(
      'with %p',
      (tagFilters: Record<string, string>) => {
        const instance = {
          Tags: [
            { Key: 'Name', Value: 'test-instance' },
            { Key: 'Environment', Value: 'production' },
          ],
        };

        const result = tagFilter(instance, tagFilters);
        expect(result).toBe(true);
      },
    );
  });

  it('should return false when the instance does not have all the tags', () => {
    const instance = {
      Tags: [{ Key: 'Name', Value: 'test-instance' }],
    };
    const tagFilters = { Name: 'test', Environment: 'prod' };

    const result = tagFilter(instance, tagFilters);
    expect(result).toBe(false);
  });

  it('should return false when the instance does not have any tags', () => {
    const instance = {};
    const tagFilters = { Name: 'test', Environment: 'prod' };

    const result = tagFilter(instance, tagFilters);
    expect(result).toBe(false);
  });

  it('should return true if the tag filters are empty', () => {
    const instance = {
      Tags: [
        { Key: 'Name', Value: 'test-instance' },
        { Key: 'Environment', Value: 'production' },
      ],
    };
    const tagFilters = {};

    const result = tagFilter(instance, tagFilters);
    expect(result).toBe(true);
  });

  it('should return false if instance is null', () => {
    const instance = null;
    const tagFilters = { Name: 'test', Environment: 'prod' };

    const result = tagFilter(instance, tagFilters);
    expect(result).toBe(false);
  });
});
