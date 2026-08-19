import { getTracedAWSV3Client } from '@aws-github-runner/aws-powertools-util';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

let memoisedClient: DynamoDBClient | undefined;

export function getDynamoDbClient(): DynamoDBClient {
  memoisedClient ??= getTracedAWSV3Client(
    new DynamoDBClient({
      region: process.env.AWS_REGION,
      maxAttempts: 10,
      // One client serves two tables, so avoid an adaptive rate bucket coupling their throttling behavior.
      retryMode: 'standard',
    }),
  );
  return memoisedClient;
}

// Test-only reset for cases that need a fresh AWS SDK client.
export function resetDynamoDbClient(): void {
  memoisedClient = undefined;
}
