import {
  ConditionalCheckFailedException,
  DeleteItemCommand,
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateRunnerStateRecord } from '../../core';
import { resetDynamoDbClient } from './client';
import { createAwsDynamoDbRunnerStateStore } from './runner-state-store';

const mockDynamoDbClient = mockClient(DynamoDBClient);
const cleanEnv = process.env;

describe('aws_dynamodb runner state store', () => {
  beforeEach(() => {
    mockDynamoDbClient.reset();
    resetDynamoDbClient();
    process.env = { ...cleanEnv };
    process.env.AWS_REGION = 'eu-west-1';
    process.env.RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME = 'runner-state';
    process.env.RUNNER_CONFIG_DYNAMODB_ENTRY_ID = 'linux-x64';
    process.env.RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TTL_SECONDS = '86400';
    mockDynamoDbClient.on(PutItemCommand).resolves({});
    mockDynamoDbClient.on(UpdateItemCommand).resolves({});
    mockDynamoDbClient.on(DeleteItemCommand).resolves({});
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a provisioning record without a secret payload or overwrite', async () => {
    const store = createAwsDynamoDbRunnerStateStore();

    await store.create(createRecord());

    expect(mockDynamoDbClient).toHaveReceivedCommandWith(PutItemCommand, {
      TableName: 'runner-state',
      Item: {
        scope: { S: 'entry#linux-x64#runner-state' },
        id: { S: 'runner#runner-123' },
        runner_id: { S: 'runner-123' },
        compute_provider: { S: 'aws_ec2' },
        compute_resource_id: { S: 'i-123' },
        runner_name: { S: 'ghr-runner-123' },
        runner_labels: { L: [{ S: 'linux' }, { S: 'x64' }] },
        runner_owner: { S: 'github-aws-runners' },
        runner_type: { S: 'Org' },
        state: { S: 'provisioning' },
        created_at: { S: '2025-01-01T00:00:00.000Z' },
        updated_at: { S: '2025-01-01T00:00:00.000Z' },
        expires_at: { N: '1735776000' },
        metadata: {
          L: [{ M: { key: { S: 'Environment' }, value: { S: 'test' } } }],
        },
      },
      ConditionExpression: 'attribute_not_exists(#scope) AND attribute_not_exists(#id)',
      ExpressionAttributeNames: { '#scope': 'scope', '#id': 'id' },
    });
    const item = mockDynamoDbClient.commandCalls(PutItemCommand)[0].args[0].input.Item;
    expect(item).not.toHaveProperty('value');
  });

  it('omits optional attributes when provisioning data is not available yet', async () => {
    const store = createAwsDynamoDbRunnerStateStore();
    const record = createRecord();
    delete record.runnerName;
    delete record.runnerLabels;
    delete record.metadata;

    await store.create(record);

    const item = mockDynamoDbClient.commandCalls(PutItemCommand)[0].args[0].input.Item;
    expect(item).not.toHaveProperty('runner_name');
    expect(item).not.toHaveProperty('runner_labels');
    expect(item).not.toHaveProperty('metadata');
  });

  it('preserves empty provider-neutral metadata values', async () => {
    const store = createAwsDynamoDbRunnerStateStore();

    await store.create({ ...createRecord(), metadata: [{ key: 'OptionalTag', value: '' }] });

    expect(mockDynamoDbClient.commandCalls(PutItemCommand)[0].args[0].input.Item?.metadata).toEqual({
      L: [{ M: { key: { S: 'OptionalTag' }, value: { S: '' } } }],
    });
  });

  it('activates only provisioning records and atomically adds GitHub identity metadata', async () => {
    const store = createAwsDynamoDbRunnerStateStore();

    await store.activate('runner-123', {
      githubRunnerId: '9876',
      runnerName: 'jit-runner',
      runnerLabels: ['linux', 'arm64'],
      metadata: [{ key: 'zone', value: 'eu-west-1a' }],
    });

    expect(mockDynamoDbClient).toHaveReceivedCommandWith(UpdateItemCommand, {
      TableName: 'runner-state',
      Key: { scope: { S: 'entry#linux-x64#runner-state' }, id: { S: 'runner#runner-123' } },
      UpdateExpression:
        'SET #state = :state, #updatedAt = :updatedAt, #runnerName = :runnerName, #runnerLabels = :runnerLabels, #githubRunnerId = :githubRunnerId, #metadata = :metadata REMOVE #expiresAt',
      ConditionExpression: 'attribute_exists(#scope) AND attribute_exists(#id) AND #state IN (:expectedState0)',
      ExpressionAttributeNames: {
        '#scope': 'scope',
        '#id': 'id',
        '#state': 'state',
        '#updatedAt': 'updated_at',
        '#expiresAt': 'expires_at',
        '#runnerName': 'runner_name',
        '#runnerLabels': 'runner_labels',
        '#githubRunnerId': 'github_runner_id',
        '#metadata': 'metadata',
      },
      ExpressionAttributeValues: {
        ':state': { S: 'active' },
        ':updatedAt': { S: '2025-01-01T00:00:00.000Z' },
        ':runnerName': { S: 'jit-runner' },
        ':runnerLabels': { L: [{ S: 'linux' }, { S: 'arm64' }] },
        ':githubRunnerId': { S: '9876' },
        ':metadata': { L: [{ M: { key: { S: 'zone' }, value: { S: 'eu-west-1a' } } }] },
        ':expectedState0': { S: 'provisioning' },
      },
    });
  });

  it('records GitHub identity while the runner remains provisioning', async () => {
    const store = createAwsDynamoDbRunnerStateStore();

    await store.recordGitHubIdentity('runner-123', {
      githubRunnerId: '9876',
      runnerName: 'jit-runner',
      runnerLabels: ['linux', 'arm64'],
    });

    expect(mockDynamoDbClient).toHaveReceivedCommandWith(UpdateItemCommand, {
      TableName: 'runner-state',
      Key: { scope: { S: 'entry#linux-x64#runner-state' }, id: { S: 'runner#runner-123' } },
      UpdateExpression:
        'SET #state = :state, #updatedAt = :updatedAt, #expiresAt = :expiresAt, #runnerName = :runnerName, #runnerLabels = :runnerLabels, #githubRunnerId = :githubRunnerId',
      ConditionExpression: 'attribute_exists(#scope) AND attribute_exists(#id) AND #state IN (:expectedState0)',
      ExpressionAttributeValues: expect.objectContaining({
        ':state': { S: 'provisioning' },
        ':updatedAt': { S: '2025-01-01T00:00:00.000Z' },
        ':expiresAt': { N: '1735776000' },
        ':runnerName': { S: 'jit-runner' },
        ':runnerLabels': { L: [{ S: 'linux' }, { S: 'arm64' }] },
        ':githubRunnerId': { S: '9876' },
        ':expectedState0': { S: 'provisioning' },
      }),
    });
  });

  it('lists all pages for an entry with a strongly consistent query', async () => {
    const lastKey = { scope: { S: 'entry#linux-x64#runner-state' }, id: { S: 'runner#runner-123' } };
    mockDynamoDbClient
      .on(QueryCommand)
      .resolvesOnce({ Items: [storedRecord()], LastEvaluatedKey: lastKey })
      .resolvesOnce({ Items: [storedRecord({ runnerId: 'runner-456', resourceId: 'vm-456' })] });
    const store = createAwsDynamoDbRunnerStateStore();

    await expect(store.list()).resolves.toEqual([
      expectedRecord(),
      expectedRecord({ runnerId: 'runner-456', resourceId: 'vm-456' }),
    ]);
    const calls = mockDynamoDbClient.commandCalls(QueryCommand);
    expect(calls).toHaveLength(2);
    expect(calls[0].args[0].input).toMatchObject({
      TableName: 'runner-state',
      KeyConditionExpression: '#scope = :scope AND begins_with(#id, :runner)',
      ConsistentRead: true,
      ExpressionAttributeValues: {
        ':scope': { S: 'entry#linux-x64#runner-state' },
        ':runner': { S: 'runner#' },
      },
    });
    expect(calls[1].args[0].input.ExclusiveStartKey).toEqual(lastKey);
  });

  it('filters by compute provider while retaining an entry-scoped key query', async () => {
    mockDynamoDbClient.on(QueryCommand).resolves({ Items: [] });
    const store = createAwsDynamoDbRunnerStateStore();

    await store.list({ computeProvider: 'aws_microvm' });

    expect(mockDynamoDbClient).toHaveReceivedCommandWith(QueryCommand, {
      FilterExpression: '#computeProvider = :computeProvider',
      ExpressionAttributeNames: {
        '#scope': 'scope',
        '#id': 'id',
        '#computeProvider': 'compute_provider',
      },
      ExpressionAttributeValues: {
        ':scope': { S: 'entry#linux-x64#runner-state' },
        ':runner': { S: 'runner#' },
        ':computeProvider': { S: 'aws_microvm' },
      },
    });
  });

  it('maps optional fields as absent and rejects corrupt lifecycle state', async () => {
    const item = storedRecord();
    delete item.runner_name;
    delete item.runner_labels;
    delete item.github_runner_id;
    delete item.metadata;
    mockDynamoDbClient.on(QueryCommand).resolves({ Items: [item] });
    const store = createAwsDynamoDbRunnerStateStore();

    await expect(store.list()).resolves.toEqual([
      expect.objectContaining({
        runnerName: undefined,
        runnerLabels: undefined,
        githubRunnerId: undefined,
        metadata: undefined,
      }),
    ]);

    item.state = { S: 'unknown' };
    mockDynamoDbClient.on(QueryCommand).resolves({ Items: [item] });
    await expect(store.list()).rejects.toThrow(
      "Runner state item 'entry#linux-x64#runner-state/runner#runner-123' has an invalid 'state' attribute",
    );
  });

  it('marks and unmarks orphan state with conditional transitions', async () => {
    const store = createAwsDynamoDbRunnerStateStore();

    await store.markOrphan('runner-123');
    await store.unmarkOrphan('runner-123');

    const calls = mockDynamoDbClient.commandCalls(UpdateItemCommand);
    expect(calls[0].args[0].input.ExpressionAttributeValues).toMatchObject({
      ':state': { S: 'orphan' },
      ':expectedState0': { S: 'active' },
    });
    expect(calls[0].args[0].input.UpdateExpression).toContain('REMOVE #expiresAt');
    expect(calls[0].args[0].input.ExpressionAttributeValues).not.toHaveProperty(':expiresAt');
    expect(calls[1].args[0].input.ExpressionAttributeValues).toMatchObject({
      ':state': { S: 'active' },
      ':expectedState0': { S: 'orphan' },
    });
    expect(calls[1].args[0].input.UpdateExpression).toContain('REMOVE #expiresAt');
    expect(calls[1].args[0].input.ExpressionAttributeValues).not.toHaveProperty(':expiresAt');
  });

  it.each(['provisioning', 'active', 'orphan'] as const)(
    'claims termination and returns the prior %s state',
    async (state) => {
      mockDynamoDbClient.on(UpdateItemCommand).resolves({ Attributes: { state: { S: state } } });
      const store = createAwsDynamoDbRunnerStateStore();

      await expect(store.beginTermination('runner-123')).resolves.toBe(state);
      expect(mockDynamoDbClient).toHaveReceivedCommandWith(UpdateItemCommand, {
        ReturnValues: 'ALL_OLD',
        ConditionExpression:
          'attribute_exists(#scope) AND attribute_exists(#id) AND (#state IN (:provisioning, :active, :orphan) OR (#state = :terminating AND #updatedAt < :staleBefore))',
        ExpressionAttributeValues: expect.objectContaining({
          ':terminating': { S: 'terminating' },
          ':expiresAt': { N: '1735776000' },
          ':provisioning': { S: 'provisioning' },
          ':active': { S: 'active' },
          ':orphan': { S: 'orphan' },
          ':staleBefore': { S: '2024-12-31T23:44:00.000Z' },
        }),
      });
    },
  );

  it('reclaims a stale terminating record on a later invocation without allowing an immediate double claim', async () => {
    mockDynamoDbClient
      .on(UpdateItemCommand)
      .resolvesOnce({ Attributes: { state: { S: 'active' } } })
      .rejectsOnce(new ConditionalCheckFailedException({ $metadata: {}, message: 'lease is still held' }))
      .resolvesOnce({ Attributes: { state: { S: 'terminating' } } });
    const store = createAwsDynamoDbRunnerStateStore();

    await expect(store.beginTermination('runner-123')).resolves.toBe('active');
    await expect(store.beginTermination('runner-123')).resolves.toBeUndefined();
    vi.advanceTimersByTime(17 * 60 * 1000);
    await expect(store.beginTermination('runner-123')).resolves.toBe('terminating');

    const reclaimed = mockDynamoDbClient.commandCalls(UpdateItemCommand)[2].args[0].input;
    expect(reclaimed.ExpressionAttributeValues?.[':staleBefore']).toEqual({
      S: '2025-01-01T00:01:00.000Z',
    });
  });

  it('returns undefined when another invocation already owns termination', async () => {
    mockDynamoDbClient
      .on(UpdateItemCommand)
      .rejects(new ConditionalCheckFailedException({ $metadata: {}, message: 'condition failed' }));
    const store = createAwsDynamoDbRunnerStateStore();

    await expect(store.beginTermination('runner-123')).resolves.toBeUndefined();
  });

  it('restores the safety TTL when cancellation returns a runner to provisioning', async () => {
    const store = createAwsDynamoDbRunnerStateStore();

    await store.cancelTermination('runner-123', 'provisioning');

    expect(mockDynamoDbClient).toHaveReceivedCommandWith(UpdateItemCommand, {
      UpdateExpression: 'SET #state = :state, #updatedAt = :updatedAt, #expiresAt = :expiresAt',
      ExpressionAttributeValues: expect.objectContaining({
        ':state': { S: 'provisioning' },
        ':expiresAt': { N: '1735776000' },
        ':expectedState0': { S: 'terminating' },
      }),
    });
  });

  it.each(['active', 'orphan'] as const)('removes the safety TTL when cancellation restores %s', async (state) => {
    const store = createAwsDynamoDbRunnerStateStore();

    await store.cancelTermination('runner-123', state);

    expect(mockDynamoDbClient).toHaveReceivedCommandWith(UpdateItemCommand, {
      UpdateExpression: 'SET #state = :state, #updatedAt = :updatedAt REMOVE #expiresAt',
      ExpressionAttributeValues: expect.objectContaining({
        ':state': { S: state },
        ':expectedState0': { S: 'terminating' },
      }),
    });
    const values = mockDynamoDbClient.commandCalls(UpdateItemCommand)[0].args[0].input.ExpressionAttributeValues;
    expect(values).not.toHaveProperty(':expiresAt');
  });

  it('deletes only a record whose termination was claimed', async () => {
    const store = createAwsDynamoDbRunnerStateStore();

    await store.delete('runner-123');

    expect(mockDynamoDbClient).toHaveReceivedCommandWith(DeleteItemCommand, {
      TableName: 'runner-state',
      Key: { scope: { S: 'entry#linux-x64#runner-state' }, id: { S: 'runner#runner-123' } },
      ConditionExpression: '#state = :terminating',
      ExpressionAttributeNames: { '#state': 'state' },
      ExpressionAttributeValues: { ':terminating': { S: 'terminating' } },
    });
  });

  it.each([
    'RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME',
    'RUNNER_CONFIG_DYNAMODB_ENTRY_ID',
    'RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TTL_SECONDS',
  ] as const)('rejects missing provider environment %s', (name) => {
    delete process.env[name];

    expect(() => createAwsDynamoDbRunnerStateStore()).toThrow(`Environment variable ${name} is not set`);
    expect(mockDynamoDbClient.calls()).toHaveLength(0);
  });

  it.each(['0', '-1', '1.5', 'not-a-number'])('rejects invalid state TTL %j', (ttl) => {
    process.env.RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TTL_SECONDS = ttl;

    expect(() => createAwsDynamoDbRunnerStateStore()).toThrow(
      'Environment variable RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TTL_SECONDS must be a positive integer',
    );
  });

  it('validates records before writing', async () => {
    const store = createAwsDynamoDbRunnerStateStore();

    await expect(store.create({ ...createRecord(), computeProvider: '  ' })).rejects.toThrow(
      "Runner state field 'computeProvider' must be a non-empty string",
    );
    await expect(store.create({ ...createRecord(), runnerType: 'Team' as never })).rejects.toThrow(
      "Runner state field 'runnerType' must be 'Org' or 'Repo'",
    );
    await expect(store.activate('runner-123', { runnerLabels: [''] })).rejects.toThrow(
      "Runner state field 'runnerLabels' must be a non-empty string",
    );
    await expect(store.recordGitHubIdentity('runner-123', { githubRunnerId: '' })).rejects.toThrow(
      "Runner state field 'githubRunnerId' must be a non-empty string",
    );
    await expect(store.list({ computeProvider: '' })).rejects.toThrow(
      "Runner state field 'computeProvider' must be a non-empty string",
    );
    expect(mockDynamoDbClient.calls()).toHaveLength(0);
  });

  it('propagates non-conditional lifecycle errors', async () => {
    const error = new Error('service unavailable');
    mockDynamoDbClient.on(UpdateItemCommand).rejects(error);
    const store = createAwsDynamoDbRunnerStateStore();

    await expect(store.beginTermination('runner-123')).rejects.toBe(error);
  });
});

function createRecord(): CreateRunnerStateRecord {
  return {
    runnerId: 'runner-123',
    computeProvider: 'aws_ec2',
    computeResourceId: 'i-123',
    runnerName: 'ghr-runner-123',
    runnerLabels: ['linux', 'x64'],
    runnerOwner: 'github-aws-runners',
    runnerType: 'Org',
    metadata: [{ key: 'Environment', value: 'test' }],
  };
}

function storedRecord(options: { runnerId?: string; resourceId?: string } = {}): Record<string, AttributeValue> {
  const runnerId = options.runnerId ?? 'runner-123';
  return {
    scope: { S: 'entry#linux-x64#runner-state' },
    id: { S: `runner#${runnerId}` },
    runner_id: { S: runnerId },
    compute_provider: { S: 'aws_ec2' },
    compute_resource_id: { S: options.resourceId ?? 'i-123' },
    runner_name: { S: `ghr-${runnerId}` },
    runner_labels: { L: [{ S: 'linux' }, { S: 'x64' }] },
    github_runner_id: { S: '9876' },
    runner_owner: { S: 'github-aws-runners' },
    runner_type: { S: 'Org' },
    state: { S: 'active' },
    created_at: { S: '2025-01-01T00:00:00.000Z' },
    updated_at: { S: '2025-01-01T00:01:00.000Z' },
    metadata: { L: [{ M: { key: { S: 'Environment' }, value: { S: 'test' } } }] },
  };
}

function expectedRecord(options: { runnerId?: string; resourceId?: string } = {}) {
  const runnerId = options.runnerId ?? 'runner-123';
  return {
    runnerId,
    computeProvider: 'aws_ec2',
    computeResourceId: options.resourceId ?? 'i-123',
    runnerName: `ghr-${runnerId}`,
    runnerLabels: ['linux', 'x64'],
    githubRunnerId: '9876',
    runnerOwner: 'github-aws-runners',
    runnerType: 'Org',
    state: 'active',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:01:00.000Z',
    metadata: [{ key: 'Environment', value: 'test' }],
  };
}
