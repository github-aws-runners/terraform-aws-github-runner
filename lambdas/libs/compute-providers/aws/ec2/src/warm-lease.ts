import { DeleteItemCommand, type DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

export const WARM_LEASE_TTL_SECONDS = 10 * 60;
const CONDITIONAL_CHECK_FAILED = 'ConditionalCheckFailedException';

// In the Lambda bundle the SDK can surface this as a plain Error whose message is the error code.
function isConditionalCheckFailed(error: unknown): boolean {
  return (
    error instanceof Error && (error.name === CONDITIONAL_CHECK_FAILED || error.message === CONDITIONAL_CHECK_FAILED)
  );
}

export interface WarmLeaseStore {
  /** Resolves false when another invocation holds an unexpired lease; throws when the table is unusable. */
  claim(instanceId: string): Promise<boolean>;
  release(instanceId: string): Promise<void>;
}

export function createWarmLeaseStore(dynamoClient: DynamoDBClient, tableName: string): WarmLeaseStore {
  return {
    claim: async (instanceId) => {
      const now = Math.floor(Date.now() / 1000);
      try {
        await dynamoClient.send(
          new PutItemCommand({
            TableName: tableName,
            Item: { instanceId: { S: instanceId }, expiresAt: { N: String(now + WARM_LEASE_TTL_SECONDS) } },
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
      await dynamoClient.send(new DeleteItemCommand({ TableName: tableName, Key: { instanceId: { S: instanceId } } }));
    },
  };
}
