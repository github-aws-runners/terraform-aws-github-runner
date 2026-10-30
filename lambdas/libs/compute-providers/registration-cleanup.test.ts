import { beforeEach, describe, expect, it } from 'vitest';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { mockClient } from 'aws-sdk-client-mock';
import { createRegistrationCleanupProvider } from './registration-cleanup';

const ec2 = mockClient(EC2Client);
const id = 'i-0123456789abcdef0';
const create = (regions = ['eu-west-1', 'us-east-1']) =>
  createRegistrationCleanupProvider({ type: 'ec2', options: { regions } }, 'owned_');
beforeEach(() => ec2.reset());

describe('EC2 registration cleanup provider', () => {
  it('rejects unknown providers and invalid inventory scope', () => {
    expect(() => createRegistrationCleanupProvider({ type: 'missing', options: {} }, 'owned_')).toThrow('Unknown');
    for (const options of [null, {}, { regions: [] }, { regions: [''] }, { regions: [1] }]) {
      expect(() => createRegistrationCleanupProvider({ type: 'ec2', options }, 'owned_')).toThrow('Invalid');
    }
  });
  it('only claims exact prefixed EC2 names and normalizes scope', () => {
    expect(create().resourceIdFromRunnerName(`owned_${id}`)).toBe(id);
    expect(create().resourceIdFromRunnerName(`other_${id}`)).toBeUndefined();
    expect(create().resourceIdFromRunnerName('owned_container-42')).toBeUndefined();
    expect(create().scope).toBe(create(['us-east-1', 'eu-west-1', 'eu-west-1']).scope);
  });
  it('requires every page and region to establish absence', async () => {
    ec2
      .on(DescribeInstancesCommand)
      .resolvesOnce({ Reservations: [], NextToken: 'next' })
      .resolvesOnce({ Reservations: [{ Instances: [{ InstanceId: id, State: { Name: 'terminated' } }] }] })
      .resolvesOnce({ Reservations: [] });
    expect(await create().exists(id)).toBe(false);
    expect(ec2.commandCalls(DescribeInstancesCommand)).toHaveLength(3);
  });
  it.each(['stopped', 'running', undefined])('protects a resource with state %s', async (state) => {
    ec2.on(DescribeInstancesCommand).resolves({
      Reservations: [
        {
          Instances: [
            {
              InstanceId: id,
              State: state ? { Name: state as 'running' } : undefined,
            },
          ],
        },
      ],
    });
    expect(await create().exists(id)).toBe(true);
  });
  it('does not convert an incomplete lookup to absence', async () => {
    ec2.on(DescribeInstancesCommand).resolvesOnce({ Reservations: [] }).rejectsOnce(new Error('unavailable'));
    await expect(create().exists(id)).rejects.toThrow('unavailable');
  });
});
