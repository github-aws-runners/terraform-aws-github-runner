import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { DynamoDBClient, TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Context } from 'aws-lambda';

import { handler } from './lambda';

const ec2Mock = mockClient(EC2Client);
const ddbMock = mockClient(DynamoDBClient);

const ctx = { awsRequestId: 'test', functionName: 'runner-count-cache' } as unknown as Context;

function event(instanceId: string, state: string) {
  // Only event.detail is read by the handler.
  return { detail: { 'instance-id': instanceId, state } } as never;
}

function runnerInstance(tags: { Key: string; Value: string }[]) {
  return { Reservations: [{ Instances: [{ Tags: tags }] }] };
}

const defaultTags = [
  { Key: 'ghr:Application', Value: 'github-action-runner' },
  { Key: 'ghr:environment', Value: 'prod' },
  { Key: 'ghr:Type', Value: 'Repo' },
  { Key: 'ghr:Owner', Value: 'acme/app' },
];

const transactions = () => ddbMock.commandCalls(TransactWriteItemsCommand).map((c) => c.args[0].input);
const condFail = () => Object.assign(new Error('cancelled'), { name: 'TransactionCanceledException' });

beforeEach(() => {
  ec2Mock.reset();
  ddbMock.reset();
  process.env.AWS_REGION = 'eu-west-1';
  process.env.DYNAMODB_TABLE_NAME = 'runner-count';
  delete process.env.ENVIRONMENT_FILTER;
  ec2Mock.on(DescribeInstancesCommand).resolves(runnerInstance(defaultTags));
  ddbMock.on(TransactWriteItemsCommand).resolves({});
});

describe('runner-count-cache handler', () => {
  it('pending: creates marker (if absent) and increments, atomically', async () => {
    await handler(event('i-1', 'pending'), ctx);
    const tx = transactions();
    expect(tx).toHaveLength(1);
    const items = tx[0].TransactItems!;
    expect(items[0].Put!.ConditionExpression).toBe('attribute_not_exists(pk)');
    expect((items[0].Put!.Item!.pk as { S: string }).S).toBe('INSTANCE#i-1');
    expect((items[0].Put!.Item!.state as { S: string }).S).toBe('COUNTED');
    expect(items[1].Update!.Key!.pk).toEqual({ S: 'prod#Repo#acme/app' });
    expect(items[1].Update!.ExpressionAttributeValues![':one']).toEqual({ N: '1' });
  });

  it('running: also attempts +1 (marker dedups the pending->running pair)', async () => {
    await handler(event('i-1', 'running'), ctx);
    expect(transactions()).toHaveLength(1);
    expect(transactions()[0].TransactItems![0].Put!.ConditionExpression).toBe('attribute_not_exists(pk)');
  });

  it('duplicate active event is an idempotent no-op (transaction cancelled)', async () => {
    ddbMock.on(TransactWriteItemsCommand).rejects(condFail());
    await expect(handler(event('i-1', 'running'), ctx)).resolves.toBeUndefined();
  });

  it('terminated: transitions marker COUNTED->TERMINATED and decrements', async () => {
    await handler(event('i-1', 'terminated'), ctx);
    const items = transactions()[0].TransactItems!;
    expect(items[0].Update!.ConditionExpression).toBe('attribute_exists(pk) AND #state = :counted');
    expect(items[0].Update!.ExpressionAttributeValues![':term']).toEqual({ S: 'TERMINATED' });
    expect(items[1].Update!.ExpressionAttributeValues![':negOne']).toEqual({ N: '-1' });
  });

  it('duplicate terminated is an idempotent no-op (no double decrement)', async () => {
    ddbMock.on(TransactWriteItemsCommand).rejects(condFail());
    await expect(handler(event('i-1', 'terminated'), ctx)).resolves.toBeUndefined();
  });

  it('terminated for an uncounted instance does not underflow (guard rejects)', async () => {
    // marker missing / not COUNTED -> transaction cancelled -> no decrement
    ddbMock.on(TransactWriteItemsCommand).rejects(condFail());
    await handler(event('i-unknown', 'terminated'), ctx);
    // handler swallowed the cancellation; the -1 never landed
    await expect(handler(event('i-unknown', 'terminated'), ctx)).resolves.toBeUndefined();
  });

  it('ignores non-runner instances', async () => {
    ec2Mock.on(DescribeInstancesCommand).resolves(
      runnerInstance([{ Key: 'ghr:Application', Value: 'something-else' }]),
    );
    await handler(event('i-1', 'pending'), ctx);
    expect(transactions()).toHaveLength(0);
  });

  it('respects the environment filter', async () => {
    process.env.ENVIRONMENT_FILTER = 'prod';
    ec2Mock.on(DescribeInstancesCommand).resolves(
      runnerInstance([
        { Key: 'ghr:Application', Value: 'github-action-runner' },
        { Key: 'ghr:environment', Value: 'staging' },
        { Key: 'ghr:Type', Value: 'Repo' },
        { Key: 'ghr:Owner', Value: 'acme/app' },
      ]),
    );
    await handler(event('i-1', 'pending'), ctx);
    expect(transactions()).toHaveLength(0);
  });

  it('skips instances missing required tags', async () => {
    ec2Mock.on(DescribeInstancesCommand).resolves(
      runnerInstance([{ Key: 'ghr:Application', Value: 'github-action-runner' }]),
    );
    await handler(event('i-1', 'pending'), ctx);
    expect(transactions()).toHaveLength(0);
  });

  it('does not touch DynamoDB for transitional states (e.g. stopping->? unmapped)', async () => {
    await handler(event('i-1', 'rebooting'), ctx);
    expect(transactions()).toHaveLength(0);
  });

  it('rethrows non-cancellation errors so EventBridge retries / DLQs', async () => {
    ddbMock.on(TransactWriteItemsCommand).rejects(
      Object.assign(new Error('throttled'), { name: 'ProvisionedThroughputExceededException' }),
    );
    await expect(handler(event('i-1', 'pending'), ctx)).rejects.toThrow('throttled');
  });
});
