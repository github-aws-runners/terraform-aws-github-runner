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
import { DynamoDBClient, TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb';
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
 * A COUNTED marker must outlive the runner so a late-redelivered `running`
 * cannot re-increment. Terminated markers are retained (via the shorter cleanup
 * TTL) only long enough to dedup late `terminated` redeliveries, then swept.
 */
const COUNTED_MARKER_TTL_SECONDS = 7 * 86400; // 7 days

/**
 * Idempotent +1. Atomically creates the per-instance marker only if it does not
 * already exist, and increments the group counter. EventBridge is at-least-once
 * and unordered, so a redelivered `pending`/`running` finds the marker present
 * and the transaction is cancelled — no double count, and no IDLE->LAUNCHING style
 * regression.
 */
async function countInstance(
  dynamodb: DynamoDBClient,
  tableName: string,
  counterPk: string,
  instanceId: string,
  ttlSeconds: number,
): Promise<void> {
  const now = Date.now();
  const nowSec = Math.floor(now / 1000);
  await dynamodb.send(
    new TransactWriteItemsCommand({
      TransactItems: [
        {
          Put: {
            TableName: tableName,
            Item: {
              pk: { S: `INSTANCE#${instanceId}` },
              state: { S: 'COUNTED' },
              updated: { N: String(now) },
              ttl: { N: String(nowSec + COUNTED_MARKER_TTL_SECONDS) },
            },
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
        {
          Update: {
            TableName: tableName,
            Key: { pk: { S: counterPk } },
            UpdateExpression: 'ADD #count :one SET #updated = :now, #ttl = :ttl',
            ExpressionAttributeNames: { '#count': 'count', '#updated': 'updated', '#ttl': 'ttl' },
            ExpressionAttributeValues: {
              ':one': { N: '1' },
              ':now': { N: String(now) },
              ':ttl': { N: String(nowSec + ttlSeconds) },
            },
          },
        },
      ],
    }),
  );
}

/**
 * Idempotent -1. Atomically transitions the marker COUNTED -> TERMINATED only if
 * it is currently COUNTED, and decrements the group counter. A redelivered
 * `terminated`, or one for an instance this system never counted (out-of-order,
 * or pre-existing before the feature was enabled), fails the condition and the
 * transaction is cancelled — no double decrement, and no negative drift. The
 * marker guard is what makes a separate write-time floor unnecessary: a -1 can
 * only apply when the matching +1 was recorded here.
 */
async function uncountInstance(
  dynamodb: DynamoDBClient,
  tableName: string,
  counterPk: string,
  instanceId: string,
  ttlSeconds: number,
): Promise<void> {
  const now = Date.now();
  const nowSec = Math.floor(now / 1000);
  await dynamodb.send(
    new TransactWriteItemsCommand({
      TransactItems: [
        {
          Update: {
            TableName: tableName,
            Key: { pk: { S: `INSTANCE#${instanceId}` } },
            UpdateExpression: 'SET #state = :term, #updated = :now, #ttl = :ttl',
            ConditionExpression: 'attribute_exists(pk) AND #state = :counted',
            ExpressionAttributeNames: { '#state': 'state', '#updated': 'updated', '#ttl': 'ttl' },
            ExpressionAttributeValues: {
              ':term': { S: 'TERMINATED' },
              ':counted': { S: 'COUNTED' },
              ':now': { N: String(now) },
              ':ttl': { N: String(nowSec + ttlSeconds) },
            },
          },
        },
        {
          Update: {
            TableName: tableName,
            Key: { pk: { S: counterPk } },
            UpdateExpression: 'ADD #count :negOne SET #updated = :now',
            ExpressionAttributeNames: { '#count': 'count', '#updated': 'updated' },
            ExpressionAttributeValues: { ':negOne': { N: '-1' }, ':now': { N: String(now) } },
          },
        },
      ],
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

  // Map state to a counting intent. With the per-instance marker guard we can
  // safely count on the first "active" event (pending or running): whichever
  // arrives first records the marker and increments, and the other is a no-op.
  // This avoids the pending->running double-count without missing a runner that
  // dies before ever reaching `running`.
  const isActive = state === 'pending' || state === 'running';
  const isGone = state === 'terminated' || state === 'stopped' || state === 'shutting-down';

  if (!isActive && !isGone) {
    logger.debug('State does not affect counter', { state });
    return;
  }

  try {
    if (isActive) {
      await countInstance(dynamodb, tableName, pk, instanceId, ttlSeconds);
    } else {
      await uncountInstance(dynamodb, tableName, pk, instanceId, ttlSeconds);
    }
    logger.info('Counter updated', { pk, state });
  } catch (error) {
    // A cancelled transaction means the marker guard rejected the write: the
    // event is a duplicate or out-of-order and has already been accounted for.
    // That is an expected idempotent no-op, not a failure.
    if ((error as { name?: string }).name === 'TransactionCanceledException') {
      logger.debug('Duplicate/out-of-order event ignored (idempotent no-op)', { pk, instanceId, state });
      return;
    }
    logger.error('Failed to update counter', { pk, state, error });
    throw error;
  }
}
