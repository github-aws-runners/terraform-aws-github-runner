import {
  ConditionalCheckFailedException,
  DeleteItemCommand,
  DynamoDBClient,
  QueryCommand,
  UpdateItemCommand,
  type UpdateItemCommandInput,
} from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dynamoDbSdkError } from '../../../test/aws-sdk-errors';
import { createWarmIndexStore, WARM_CLAIM_TTL_SECONDS, WARM_START_COOLDOWN_SECONDS } from './warm-index';

const mockDynamoClient = mockClient(DynamoDBClient);
const NOW = new Date('2026-09-30T12:00:00.000Z');
const NOW_SECONDS = NOW.getTime() / 1000;
const KEY = (instanceId: string) => ({ environment: { S: 'unit-test' }, instanceId: { S: instanceId } });
const index = createWarmIndexStore(new DynamoDBClient({}), 'warm-index', 'unit-test');

function conditionalCheckFailed(): ConditionalCheckFailedException {
  return new ConditionalCheckFailedException({ message: 'The conditional request failed', $metadata: {} });
}

function updateInputs(): UpdateItemCommandInput[] {
  return mockDynamoClient.commandCalls(UpdateItemCommand).map((call) => call.args[0].input);
}

beforeEach(() => {
  mockDynamoClient.reset();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('query', () => {
  it('returns the items of the environment across pages without the reconcile marker', async () => {
    mockDynamoClient
      .on(QueryCommand)
      .resolvesOnce({
        Items: [
          {
            ...KEY('i-warm'),
            state: { S: 'WARM' },
            launchTime: { S: '2026-09-30T10:00:00.000Z' },
            expiresAt: { S: '2026-10-08T10:00:00.000Z' },
            instanceType: { S: 'm7g.large' },
            availabilityZone: { S: 'eu-west-1a' },
            spotInstanceRequestId: { S: 'sir-1' },
            claimUntil: { N: '123' },
            startFailures: { N: '2' },
            cooldownUntil: { N: '456' },
          },
          { ...KEY('#reconcile'), lastRun: { N: '1' } },
        ],
        LastEvaluatedKey: KEY('i-warm'),
      })
      .resolvesOnce({ Items: [{ ...KEY('i-active'), state: { S: 'ACTIVATED' }, activatedAt: { S: 'then' } }] });

    await expect(index.query()).resolves.toEqual([
      {
        instanceId: 'i-warm',
        state: 'WARM',
        launchTime: '2026-09-30T10:00:00.000Z',
        expiresAt: '2026-10-08T10:00:00.000Z',
        instanceType: 'm7g.large',
        availabilityZone: 'eu-west-1a',
        spotInstanceRequestId: 'sir-1',
        activatedAt: undefined,
        claimUntil: 123,
        startFailures: 2,
        cooldownUntil: 456,
      },
      expect.objectContaining({ instanceId: 'i-active', state: 'ACTIVATED', activatedAt: 'then' }),
    ]);
    expect(mockDynamoClient).toHaveReceivedCommandWith(QueryCommand, {
      TableName: 'warm-index',
      KeyConditionExpression: '#environment = :environment',
      ExpressionAttributeNames: { '#environment': 'environment' },
      ExpressionAttributeValues: { ':environment': { S: 'unit-test' } },
      ConsistentRead: true,
      ExclusiveStartKey: KEY('i-warm'),
    });
  });
});

describe('markWarm', () => {
  it('writes a WARM item only while it is still PRIMING', async () => {
    mockDynamoClient.on(UpdateItemCommand).resolves({});

    await expect(
      index.markWarm({
        instanceId: 'i-1',
        state: 'WARM',
        expiresAt: '2026-10-08T10:00:00.000Z',
        instanceType: 'm7g.large',
      }),
    ).resolves.toBe(true);

    expect(updateInputs()[0]).toMatchObject({
      Key: KEY('i-1'),
      UpdateExpression: 'SET #state = :state, #ttl = :ttl, expiresAt = :expiresAt, instanceType = :instanceType',
      ConditionExpression: '#state = :priming',
      ExpressionAttributeValues: expect.objectContaining({ ':state': { S: 'WARM' }, ':priming': { S: 'PRIMING' } }),
    });
  });

  it('resolves false when the item is no longer PRIMING', async () => {
    mockDynamoClient.on(UpdateItemCommand).rejects(conditionalCheckFailed());

    await expect(index.markWarm({ instanceId: 'i-1', state: 'WARM' })).resolves.toBe(false);
  });
});

describe('update', () => {
  it('writes the EC2-derived fields unless the item was activated', async () => {
    mockDynamoClient.on(UpdateItemCommand).resolves({});

    await index.update({
      instanceId: 'i-1',
      state: 'WARM',
      launchTime: '2026-09-30T10:00:00.000Z',
      expiresAt: '2026-10-08T10:00:00.000Z',
    });

    expect(updateInputs()[0]).toEqual({
      TableName: 'warm-index',
      Key: KEY('i-1'),
      UpdateExpression: 'SET #state = :state, #ttl = :ttl, launchTime = :launchTime, expiresAt = :expiresAt',
      ConditionExpression: 'attribute_not_exists(#state) OR #state <> :activated',
      ExpressionAttributeNames: { '#state': 'state', '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':state': { S: 'WARM' },
        ':ttl': { N: String(Date.parse('2026-10-09T10:00:00.000Z') / 1000) },
        ':activated': { S: 'ACTIVATED' },
        ':launchTime': { S: '2026-09-30T10:00:00.000Z' },
        ':expiresAt': { S: '2026-10-08T10:00:00.000Z' },
      },
    });
  });

  it('writes the instance type and Availability Zone', async () => {
    mockDynamoClient.on(UpdateItemCommand).resolves({});

    await index.update({ instanceId: 'i-1', state: 'WARM', instanceType: 'm7g.large', availabilityZone: 'eu-west-1a' });

    expect(updateInputs()[0]).toMatchObject({
      UpdateExpression:
        'SET #state = :state, #ttl = :ttl, instanceType = :instanceType, availabilityZone = :availabilityZone',
      ExpressionAttributeValues: expect.objectContaining({
        ':instanceType': { S: 'm7g.large' },
        ':availabilityZone': { S: 'eu-west-1a' },
      }),
    });
  });

  it('keeps an item for nine days when the expiry is unknown', async () => {
    mockDynamoClient.on(UpdateItemCommand).resolves({});

    await index.update({ instanceId: 'i-1', state: 'PRIMING' });

    expect(updateInputs()[0].ExpressionAttributeValues?.[':ttl']).toEqual({ N: String(NOW_SECONDS + 9 * 86400) });
  });

  it('leaves an activated item alone', async () => {
    mockDynamoClient.on(UpdateItemCommand).rejects(conditionalCheckFailed());

    await expect(index.update({ instanceId: 'i-1', state: 'WARM' })).resolves.toBeUndefined();
  });

  it('throws when the table cannot be used', async () => {
    mockDynamoClient.on(UpdateItemCommand).rejects(await dynamoDbSdkError('ResourceNotFoundException'));

    await expect(index.update({ instanceId: 'i-1', state: 'WARM' })).rejects.toThrow();
  });
});

describe('remove', () => {
  it('deletes the item', async () => {
    mockDynamoClient.on(DeleteItemCommand).resolves({});

    await index.remove('i-1');

    expect(mockDynamoClient).toHaveReceivedCommandWith(DeleteItemCommand, { TableName: 'warm-index', Key: KEY('i-1') });
  });

  it('removes an unclaimed item and reports a claimed one', async () => {
    mockDynamoClient.on(DeleteItemCommand).resolvesOnce({}).rejectsOnce(conditionalCheckFailed());

    await expect(index.removeUnclaimed('i-free')).resolves.toBe(true);
    await expect(index.removeUnclaimed('i-claimed')).resolves.toBe(false);
    expect(mockDynamoClient).toHaveReceivedCommandWith(DeleteItemCommand, {
      Key: KEY('i-free'),
      ConditionExpression: 'attribute_not_exists(claimUntil) OR claimUntil < :now',
      ExpressionAttributeValues: { ':now': { N: String(NOW_SECONDS) } },
    });
  });
});

describe('claim', () => {
  it('claims a warm item for ten minutes', async () => {
    mockDynamoClient.on(UpdateItemCommand).resolves({});

    await expect(index.claim('i-1')).resolves.toBe(true);

    expect(WARM_CLAIM_TTL_SECONDS).toBe(600);
    expect(updateInputs()[0]).toEqual({
      TableName: 'warm-index',
      Key: KEY('i-1'),
      UpdateExpression: 'SET claimOwner = :owner, claimUntil = :until',
      ConditionExpression: '#state = :warm AND (attribute_not_exists(claimUntil) OR claimUntil < :now)',
      ExpressionAttributeNames: { '#state': 'state' },
      ExpressionAttributeValues: {
        ':owner': { S: expect.any(String) },
        ':until': { N: String(NOW_SECONDS + 600) },
        ':warm': { S: 'WARM' },
        ':now': { N: String(NOW_SECONDS) },
      },
    });
  });

  it('reports a lost claim when the installed SDK deserializes the condition failure', async () => {
    mockDynamoClient
      .on(UpdateItemCommand)
      .rejects(await dynamoDbSdkError('ConditionalCheckFailedException', 'The conditional request failed'));

    await expect(index.claim('i-1')).resolves.toBe(false);
  });

  it('throws when the table cannot be used', async () => {
    mockDynamoClient.on(UpdateItemCommand).rejects(new Error('throttled'));

    await expect(index.claim('i-1')).rejects.toThrow('throttled');
  });

  describe('against a table with conditional writes', () => {
    let claimUntil: number | undefined;

    beforeEach(() => {
      claimUntil = undefined;
      mockDynamoClient.on(UpdateItemCommand).callsFake(async (input: UpdateItemCommandInput) => {
        await Promise.resolve();
        const now = Number(input.ExpressionAttributeValues?.[':now']?.N);
        if (claimUntil !== undefined && claimUntil >= now) throw conditionalCheckFailed();
        claimUntil = Number(input.ExpressionAttributeValues?.[':until']?.N);
        return {};
      });
    });

    it('lets exactly one of several concurrent claims win', async () => {
      const stores = [1, 2, 3].map(() => createWarmIndexStore(new DynamoDBClient({}), 'warm-index', 'unit-test'));

      const results = await Promise.all(stores.map((store) => store.claim('i-1')));

      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('takes over a claim that has expired', async () => {
      await expect(index.claim('i-1')).resolves.toBe(true);
      await expect(index.claim('i-1')).resolves.toBe(false);

      vi.setSystemTime(new Date(NOW.getTime() + (WARM_CLAIM_TTL_SECONDS + 1) * 1000));

      await expect(index.claim('i-1')).resolves.toBe(true);
    });
  });
});

describe('claim outcome', () => {
  it('releases and marks only its own claim, with a distinct owner per store', async () => {
    mockDynamoClient.on(UpdateItemCommand).resolves({});

    await index.claim('i-1');
    await index.release('i-1');
    await index.markUnusable('i-2');
    await createWarmIndexStore(new DynamoDBClient({}), 'warm-index', 'unit-test').claim('i-1');

    const [claim, release, unusable, otherClaim] = updateInputs();
    const owner = claim.ExpressionAttributeValues?.[':owner'];
    expect(release).toMatchObject({
      Key: KEY('i-1'),
      UpdateExpression: 'REMOVE claimOwner, claimUntil',
      ConditionExpression: 'claimOwner = :owner',
      ExpressionAttributeValues: { ':owner': owner },
    });
    expect(unusable).toMatchObject({
      Key: KEY('i-2'),
      UpdateExpression: 'SET #state = :garbage REMOVE claimOwner, claimUntil',
      ConditionExpression: 'claimOwner = :owner',
      ExpressionAttributeValues: { ':garbage': { S: 'GARBAGE' }, ':owner': owner },
    });
    expect(otherClaim.ExpressionAttributeValues?.[':owner']).not.toEqual(owner);
  });

  it('ignores a release or unusable mark after another invocation took over the claim', async () => {
    mockDynamoClient.on(UpdateItemCommand).rejects(conditionalCheckFailed());

    await expect(index.release('i-1')).resolves.toBeUndefined();
    await expect(index.markUnusable('i-1')).resolves.toBeUndefined();
  });

  it('releases its own claim with a cool-down and counts the failed start', async () => {
    mockDynamoClient.on(UpdateItemCommand).resolves({});

    await index.claim('i-1');
    await index.releaseWithCooldown('i-1');

    const [claim, cooldown] = updateInputs();
    expect(cooldown).toEqual({
      TableName: 'warm-index',
      Key: KEY('i-1'),
      UpdateExpression: 'SET cooldownUntil = :until ADD startFailures :one REMOVE claimOwner, claimUntil',
      ConditionExpression: 'claimOwner = :owner',
      ExpressionAttributeValues: {
        ':until': { N: String(NOW_SECONDS + WARM_START_COOLDOWN_SECONDS) },
        ':one': { N: '1' },
        ':owner': claim.ExpressionAttributeValues?.[':owner'],
      },
    });
  });

  it('ignores a cool-down after another invocation took over the claim', async () => {
    mockDynamoClient.on(UpdateItemCommand).rejects(conditionalCheckFailed());

    await expect(index.releaseWithCooldown('i-1')).resolves.toBeUndefined();
  });

  it('marks an activated item and drops its claim', async () => {
    mockDynamoClient.on(UpdateItemCommand).resolves({});

    await index.markActivated('i-1', '2026-09-30T12:00:00.000Z');

    expect(updateInputs()[0]).toMatchObject({
      Key: KEY('i-1'),
      UpdateExpression: 'SET #state = :activated, activatedAt = :activatedAt REMOVE claimOwner, claimUntil',
      ExpressionAttributeValues: {
        ':activated': { S: 'ACTIVATED' },
        ':activatedAt': { S: '2026-09-30T12:00:00.000Z' },
      },
    });
  });
});

describe('claimReconcile', () => {
  it('lets one caller per interval reconcile', async () => {
    mockDynamoClient.on(UpdateItemCommand).resolvesOnce({}).rejectsOnce(conditionalCheckFailed());

    await expect(index.claimReconcile(3600)).resolves.toBe(true);
    await expect(index.claimReconcile(3600)).resolves.toBe(false);
    expect(updateInputs()[0]).toEqual({
      TableName: 'warm-index',
      Key: KEY('#reconcile'),
      UpdateExpression: 'SET lastRun = :now, #ttl = :ttl',
      ConditionExpression: 'attribute_not_exists(lastRun) OR lastRun <= :due',
      ExpressionAttributeNames: { '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':now': { N: String(NOW_SECONDS) },
        ':due': { N: String(NOW_SECONDS - 3600) },
        ':ttl': { N: String(NOW_SECONDS + 3600 + 86400) },
      },
    });
  });
});
