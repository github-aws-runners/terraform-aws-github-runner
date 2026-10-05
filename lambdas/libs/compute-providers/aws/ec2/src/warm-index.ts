import {
  DeleteItemCommand,
  type DynamoDBClient,
  QueryCommand,
  type QueryCommandOutput,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'node:crypto';

import type { StandbyInstanceState } from '../../../core';
import { awsErrorCode } from './runners';

export const WARM_CLAIM_TTL_SECONDS = 10 * 60;
export const WARM_START_COOLDOWN_SECONDS = 10 * 60;
const CONDITIONAL_CHECK_FAILED = 'ConditionalCheckFailedException';
const RECONCILE_MARKER = '#reconcile';
const DAY_IN_SECONDS = 24 * 60 * 60;

export type WarmIndexState = Exclude<StandbyInstanceState, 'ACTIVE'> | 'ACTIVATED';

/** One warm-pool instance as last read from EC2 by the pool, plus the activation claim of scale-up. */
export interface WarmIndexItem {
  instanceId: string;
  state: WarmIndexState;
  launchTime?: string;
  expiresAt?: string;
  instanceType?: string;
  availabilityZone?: string;
  spotInstanceRequestId?: string;
  activatedAt?: string;
  claimUntil?: number;
  startFailures?: number;
  cooldownUntil?: number;
}

const UPDATE_FIELDS = ['launchTime', 'expiresAt', 'instanceType', 'availabilityZone', 'spotInstanceRequestId'] as const;

export type WarmIndexUpdate = Pick<WarmIndexItem, 'instanceId' | 'state'> &
  Partial<Pick<WarmIndexItem, (typeof UPDATE_FIELDS)[number]>>;

export interface WarmIndexStore {
  query(): Promise<WarmIndexItem[]>;
  /** Writes EC2-derived fields; never overwrites an item that scale-up marked activated. */
  update(item: WarmIndexUpdate): Promise<void>;
  remove(instanceId: string): Promise<void>;
  /** Removes the item unless scale-up holds a live claim on it; resolves false when it does. */
  removeUnclaimed(instanceId: string): Promise<boolean>;
  /** Resolves false when the instance is not warm or another invocation holds a live claim. */
  claim(instanceId: string): Promise<boolean>;
  release(instanceId: string): Promise<void>;
  /** Releases the claim after a start failed for lack of capacity, and keeps the instance out of activation for a while. */
  releaseWithCooldown(instanceId: string): Promise<void>;
  markActivated(instanceId: string, activatedAt: string): Promise<void>;
  /** Keeps a failed instance out of activation until the pool reads it from EC2 again. */
  markUnusable(instanceId: string): Promise<void>;
  /** Resolves true for at most one caller per interval. */
  claimReconcile(intervalSeconds: number): Promise<boolean>;
}

function isConditionalCheckFailed(error: unknown): boolean {
  return awsErrorCode(error) === CONDITIONAL_CHECK_FAILED;
}

async function unlessConditionFails(operation: () => Promise<unknown>): Promise<boolean> {
  try {
    await operation();
    return true;
  } catch (error) {
    if (isConditionalCheckFailed(error)) return false;
    throw error;
  }
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function numberAttribute(value: { N?: string } | undefined): number | undefined {
  return value?.N === undefined ? undefined : Number(value.N);
}

// DynamoDB TTL is a safety net only; the pool removes items itself.
function ttlSeconds(item: WarmIndexUpdate): number {
  const expiresAt = Date.parse(item.expiresAt ?? '');
  const base = Number.isNaN(expiresAt) ? nowSeconds() + 8 * DAY_IN_SECONDS : Math.floor(expiresAt / 1000);
  return base + DAY_IN_SECONDS;
}

export function createWarmIndexStore(
  dynamoClient: DynamoDBClient,
  tableName: string,
  environment: string,
): WarmIndexStore {
  // Claims are released or completed only by the invocation that took them.
  const owner = randomUUID();
  const key = (instanceId: string) => ({ environment: { S: environment }, instanceId: { S: instanceId } });

  return {
    query: async () => {
      const items: WarmIndexItem[] = [];
      let exclusiveStartKey: QueryCommandOutput['LastEvaluatedKey'];
      do {
        const result = await dynamoClient.send(
          new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: '#environment = :environment',
            ExpressionAttributeNames: { '#environment': 'environment' },
            ExpressionAttributeValues: { ':environment': { S: environment } },
            ConsistentRead: true,
            ExclusiveStartKey: exclusiveStartKey,
          }),
        );
        for (const item of result.Items ?? []) {
          const instanceId = item.instanceId?.S;
          if (!instanceId || instanceId === RECONCILE_MARKER) continue;
          items.push({
            instanceId,
            state: (item.state?.S ?? 'PRIMING') as WarmIndexState,
            launchTime: item.launchTime?.S,
            expiresAt: item.expiresAt?.S,
            instanceType: item.instanceType?.S,
            availabilityZone: item.availabilityZone?.S,
            spotInstanceRequestId: item.spotInstanceRequestId?.S,
            activatedAt: item.activatedAt?.S,
            claimUntil: numberAttribute(item.claimUntil),
            startFailures: numberAttribute(item.startFailures),
            cooldownUntil: numberAttribute(item.cooldownUntil),
          });
        }
        exclusiveStartKey = result.LastEvaluatedKey;
      } while (exclusiveStartKey);
      return items;
    },

    update: async (item) => {
      const values: Record<string, { S: string } | { N: string }> = {
        ':state': { S: item.state },
        ':ttl': { N: String(ttlSeconds(item)) },
        ':activated': { S: 'ACTIVATED' },
      };
      const assignments = ['#state = :state', '#ttl = :ttl'];
      for (const field of UPDATE_FIELDS) {
        const value = item[field];
        if (value === undefined) continue;
        assignments.push(`${field} = :${field}`);
        values[`:${field}`] = { S: value };
      }
      await unlessConditionFails(() =>
        dynamoClient.send(
          new UpdateItemCommand({
            TableName: tableName,
            Key: key(item.instanceId),
            UpdateExpression: `SET ${assignments.join(', ')}`,
            ConditionExpression: 'attribute_not_exists(#state) OR #state <> :activated',
            ExpressionAttributeNames: { '#state': 'state', '#ttl': 'ttl' },
            ExpressionAttributeValues: values,
          }),
        ),
      );
    },

    remove: async (instanceId) => {
      await dynamoClient.send(new DeleteItemCommand({ TableName: tableName, Key: key(instanceId) }));
    },

    removeUnclaimed: (instanceId) =>
      unlessConditionFails(() =>
        dynamoClient.send(
          new DeleteItemCommand({
            TableName: tableName,
            Key: key(instanceId),
            ConditionExpression: 'attribute_not_exists(claimUntil) OR claimUntil < :now',
            ExpressionAttributeValues: { ':now': { N: String(nowSeconds()) } },
          }),
        ),
      ),

    claim: (instanceId) => {
      const now = nowSeconds();
      return unlessConditionFails(() =>
        dynamoClient.send(
          new UpdateItemCommand({
            TableName: tableName,
            Key: key(instanceId),
            UpdateExpression: 'SET claimOwner = :owner, claimUntil = :until',
            ConditionExpression: '#state = :warm AND (attribute_not_exists(claimUntil) OR claimUntil < :now)',
            ExpressionAttributeNames: { '#state': 'state' },
            ExpressionAttributeValues: {
              ':owner': { S: owner },
              ':until': { N: String(now + WARM_CLAIM_TTL_SECONDS) },
              ':warm': { S: 'WARM' },
              ':now': { N: String(now) },
            },
          }),
        ),
      );
    },

    release: async (instanceId) => {
      await unlessConditionFails(() =>
        dynamoClient.send(
          new UpdateItemCommand({
            TableName: tableName,
            Key: key(instanceId),
            UpdateExpression: 'REMOVE claimOwner, claimUntil',
            ConditionExpression: 'claimOwner = :owner',
            ExpressionAttributeValues: { ':owner': { S: owner } },
          }),
        ),
      );
    },

    releaseWithCooldown: async (instanceId) => {
      await unlessConditionFails(() =>
        dynamoClient.send(
          new UpdateItemCommand({
            TableName: tableName,
            Key: key(instanceId),
            UpdateExpression: 'SET cooldownUntil = :until ADD startFailures :one REMOVE claimOwner, claimUntil',
            ConditionExpression: 'claimOwner = :owner',
            ExpressionAttributeValues: {
              ':until': { N: String(nowSeconds() + WARM_START_COOLDOWN_SECONDS) },
              ':one': { N: '1' },
              ':owner': { S: owner },
            },
          }),
        ),
      );
    },

    markActivated: async (instanceId, activatedAt) => {
      await dynamoClient.send(
        new UpdateItemCommand({
          TableName: tableName,
          Key: key(instanceId),
          UpdateExpression: 'SET #state = :activated, activatedAt = :activatedAt REMOVE claimOwner, claimUntil',
          ExpressionAttributeNames: { '#state': 'state' },
          ExpressionAttributeValues: { ':activated': { S: 'ACTIVATED' }, ':activatedAt': { S: activatedAt } },
        }),
      );
    },

    markUnusable: async (instanceId) => {
      await unlessConditionFails(() =>
        dynamoClient.send(
          new UpdateItemCommand({
            TableName: tableName,
            Key: key(instanceId),
            UpdateExpression: 'SET #state = :garbage REMOVE claimOwner, claimUntil',
            ConditionExpression: 'claimOwner = :owner',
            ExpressionAttributeNames: { '#state': 'state' },
            ExpressionAttributeValues: { ':garbage': { S: 'GARBAGE' }, ':owner': { S: owner } },
          }),
        ),
      );
    },

    claimReconcile: (intervalSeconds) => {
      const now = nowSeconds();
      return unlessConditionFails(() =>
        dynamoClient.send(
          new UpdateItemCommand({
            TableName: tableName,
            Key: key(RECONCILE_MARKER),
            UpdateExpression: 'SET lastRun = :now, #ttl = :ttl',
            ConditionExpression: 'attribute_not_exists(lastRun) OR lastRun <= :due',
            ExpressionAttributeNames: { '#ttl': 'ttl' },
            ExpressionAttributeValues: {
              ':now': { N: String(now) },
              ':due': { N: String(now - intervalSeconds) },
              ':ttl': { N: String(now + intervalSeconds + DAY_IN_SECONDS) },
            },
          }),
        ),
      );
    },
  };
}
