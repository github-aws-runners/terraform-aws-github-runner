import { DeleteItemCommand, type DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'node:crypto';

import { awsErrorCode } from './runners';

export const WARM_LEASE_TTL_SECONDS = 10 * 60;
const CONDITIONAL_CHECK_FAILED = 'ConditionalCheckFailedException';

function isConditionalCheckFailed(error: unknown): boolean {
  return awsErrorCode(error) === CONDITIONAL_CHECK_FAILED;
}

export interface WarmLeaseStore {
  /** Resolves false when another invocation holds an unexpired lease; throws when the table is unusable. */
  claim(instanceId: string): Promise<boolean>;
  release(instanceId: string): Promise<void>;
}

export function createWarmLeaseStore(dynamoClient: DynamoDBClient, tableName: string): WarmLeaseStore {
  // Release only deletes leases claimed through this store, never one taken over after expiry.
  const owner = randomUUID();
  return {
    claim: async (instanceId) => {
      const now = Math.floor(Date.now() / 1000);
      try {
        await dynamoClient.send(
          new PutItemCommand({
            TableName: tableName,
            Item: {
              instanceId: { S: instanceId },
              owner: { S: owner },
              expiresAt: { N: String(now + WARM_LEASE_TTL_SECONDS) },
            },
            // DynamoDB TTL deletes lazily, so an expired lease must not block a new claim.
            ConditionExpression: 'attribute_not_exists(instanceId) OR expiresAt < :now',
            ExpressionAttributeValues: { ':now': { N: String(now) } },
          }),
        );
        return true;
      } catch (error) {
        if (isConditionalCheckFailed(error)) return false;
        throw error;
      }
    },
    release: async (instanceId) => {
      try {
        await dynamoClient.send(
          new DeleteItemCommand({
            TableName: tableName,
            Key: { instanceId: { S: instanceId } },
            ConditionExpression: '#owner = :owner',
            ExpressionAttributeNames: { '#owner': 'owner' },
            ExpressionAttributeValues: { ':owner': { S: owner } },
          }),
        );
      } catch (error) {
        if (!isConditionalCheckFailed(error)) throw error;
      }
    },
  };
}
