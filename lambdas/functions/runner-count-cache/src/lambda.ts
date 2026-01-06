/**
 * Runner Count Cache Lambda
 *
 * This Lambda function is triggered by EventBridge when EC2 instances change state.
 * It updates an atomic counter in DynamoDB to track the number of active runners
 * per environment/type/owner combination.
 *
 * This eliminates the need for repeated DescribeInstances API calls during scale-up,
 * addressing the performance bottleneck described in Issue #4710.
 *
 * @see https://github.com/github-aws-runners/terraform-aws-github-runner/issues/4710
 */

import { EventBridgeEvent, Context } from 'aws-lambda';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { createChildLogger, setContext } from '@aws-github-runner/aws-powertools-util';

const logger = createChildLogger('runner-count-cache');

interface EC2StateChangeDetail {
  'instance-id': string;
  state: 'pending' | 'running' | 'shutting-down' | 'stopped' | 'stopping' | 'terminated';
}

interface InstanceTags {
  environment?: string;
  type?: string;
  owner?: string;
  application?: string;
}

/**
 * Get instance tags from EC2 to determine if this is a managed runner
 */
async function getInstanceTags(ec2: EC2Client, instanceId: string): Promise<InstanceTags | null> {
  try {
    const result = await ec2.send(
      new DescribeInstancesCommand({
        InstanceIds: [instanceId],
      }),
    );

    const instance = result.Reservations?.[0]?.Instances?.[0];
    if (!instance) {
      logger.debug('Instance not found', { instanceId });
      return null;
    }

    const tags = instance.Tags || [];
    return {
      environment: tags.find((t) => t.Key === 'ghr:environment')?.Value,
      type: tags.find((t) => t.Key === 'ghr:Type')?.Value,
      owner: tags.find((t) => t.Key === 'ghr:Owner')?.Value,
      application: tags.find((t) => t.Key === 'ghr:Application')?.Value,
    };
  } catch (error) {
    // Instance might already be terminated, which is fine
    logger.debug('Failed to get instance tags', { instanceId, error });
    return null;
  }
}

/**
 * Update the counter in DynamoDB using atomic increment/decrement
 */
async function updateCounter(
  dynamodb: DynamoDBClient,
  tableName: string,
  pk: string,
  increment: number,
  ttlSeconds: number,
): Promise<void> {
  const now = Date.now();
  const ttl = Math.floor(now / 1000) + ttlSeconds;

  await dynamodb.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: {
        pk: { S: pk },
      },
      UpdateExpression: 'ADD #count :inc SET #updated = :now, #ttl = :ttl',
      ExpressionAttributeNames: {
        '#count': 'count',
        '#updated': 'updated',
        '#ttl': 'ttl',
      },
      ExpressionAttributeValues: {
        ':inc': { N: String(increment) },
        ':now': { N: String(now) },
        ':ttl': { N: String(ttl) },
      },
    }),
  );
}

/**
 * Lambda handler for EC2 state change events
 */
export async function handler(
  event: EventBridgeEvent<'EC2 Instance State-change Notification', EC2StateChangeDetail>,
  context: Context,
): Promise<void> {
  setContext(context, 'lambda.ts');

  const instanceId = event.detail['instance-id'];
  const state = event.detail.state;
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  const environmentFilter = process.env.ENVIRONMENT_FILTER;
  const ttlSeconds = parseInt(process.env.TTL_SECONDS || '86400', 10);

  if (!tableName) {
    logger.error('DYNAMODB_TABLE_NAME environment variable not set');
    return;
  }

  logger.info('Processing EC2 state change', { instanceId, state });

  const ec2 = new EC2Client({ region: process.env.AWS_REGION });
  const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION });

  // Get instance tags to check if this is a managed runner
  const tags = await getInstanceTags(ec2, instanceId);

  if (!tags) {
    logger.debug('Could not get instance tags, skipping', { instanceId });
    return;
  }

  // Check if this is a GitHub Action runner
  if (tags.application !== 'github-action-runner') {
    logger.debug('Instance is not a GitHub Action runner, skipping', { instanceId });
    return;
  }

  // Check if environment matches our filter
  if (environmentFilter && tags.environment !== environmentFilter) {
    logger.debug('Instance environment does not match filter, skipping', {
      instanceId,
      instanceEnv: tags.environment,
      filterEnv: environmentFilter,
    });
    return;
  }

  // Ensure we have required tags
  if (!tags.environment || !tags.type || !tags.owner) {
    logger.debug('Instance missing required tags, skipping', { instanceId, tags });
    return;
  }

  // Generate partition key
  const pk = `${tags.environment}#${tags.type}#${tags.owner}`;

  // Determine increment based on state.
  // IMPORTANT: We only count 'running' state as +1 to avoid double-counting when instances
  // transition from pending -> running. The 'pending' state is ignored because all instances
  // that reach 'running' must first pass through 'pending', which would cause double-counting.
  let increment = 0;
  if (state === 'running') {
    increment = 1;
  } else if (state === 'terminated' || state === 'stopped' || state === 'shutting-down') {
    increment = -1;
  }

  if (increment === 0) {
    logger.debug('State does not affect counter (pending or other transitional states are ignored)', { state });
    return;
  }

  try {
    await updateCounter(dynamodb, tableName, pk, increment, ttlSeconds);
    logger.info('Counter updated', { pk, increment, state });
  } catch (error) {
    logger.error('Failed to update counter', { pk, increment, error });
    throw error;
  }
}
