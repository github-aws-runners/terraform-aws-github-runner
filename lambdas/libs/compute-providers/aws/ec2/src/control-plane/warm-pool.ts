import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  PutItemCommand,
  DeleteItemCommand,
  QueryCommand,
  GetItemCommand,
} from '@aws-sdk/client-dynamodb';
import { createChildLogger, createSingleMetric } from '@aws-github-runner/aws-powertools-util';
import { getTracedAWSV3Client } from '@aws-github-runner/aws-powertools-util';
import { getParameter } from '@aws-github-runner/aws-ssm-util';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import yn from 'yn';

const logger = createChildLogger('warm-pool');

export interface WarmPoolConfig {
  enabled: boolean;
  maxWarmInstances: number;
  maxWarmAgeHours: number;
  warmPoolReadyDelaySeconds: number;
}

export interface WarmPoolEntry {
  instanceId: string;
  runnerOwner: string;
  environment: string;
  runnerType: string;
  instanceType?: string;
  az?: string;
  amiId?: string;
  stoppedAt: string;
  expiresAt: number;
}

function getClient(): DynamoDBClient {
  return getTracedAWSV3Client(new DynamoDBClient({ region: process.env.AWS_REGION }));
}

function getTableName(): string {
  return process.env.WARM_POOL_TABLE_NAME || '';
}

export function getWarmPoolConfig(): WarmPoolConfig {
  const raw = process.env.WARM_POOL_CONFIG;
  if (!raw) {
    return { enabled: false, maxWarmInstances: 3, maxWarmAgeHours: 168, warmPoolReadyDelaySeconds: 30 };
  }
  return JSON.parse(raw) as WarmPoolConfig;
}

export function getPoolStrategy(): string {
  return process.env.POOL_STRATEGY || 'hot';
}

/**
 * Resolves the AMI ID the launch template currently points at, used to evict warm instances whose
 * AMI has gone stale. Returns undefined when no AMI SSM parameter is configured or the lookup fails.
 */
export async function resolveCurrentAmiId(): Promise<string | undefined> {
  const amiSsmParam = process.env.AMI_ID_SSM_PARAMETER_NAME;
  if (!amiSsmParam) {
    return undefined;
  }
  try {
    return await getParameter(amiSsmParam);
  } catch (e) {
    logger.warn('Failed to resolve current AMI ID for warm pool staleness check', { error: e });
    return undefined;
  }
}

export async function addToWarmPool(entry: Omit<WarmPoolEntry, 'stoppedAt' | 'expiresAt'>): Promise<void> {
  const config = getWarmPoolConfig();
  const tableName = getTableName();
  const now = new Date();
  const stoppedAt = now.toISOString();
  const expiresAt = Math.floor(now.getTime() / 1000) + config.maxWarmAgeHours * 3600;

  const client = getClient();
  await client.send(
    new PutItemCommand({
      TableName: tableName,
      Item: {
        instanceId: { S: entry.instanceId },
        runnerOwner: { S: entry.runnerOwner },
        environment: { S: entry.environment },
        runnerType: { S: entry.runnerType },
        ...(entry.instanceType && { instanceType: { S: entry.instanceType } }),
        ...(entry.az && { az: { S: entry.az } }),
        ...(entry.amiId && { amiId: { S: entry.amiId } }),
        stoppedAt: { S: stoppedAt },
        expiresAt: { N: String(expiresAt) },
      },
    }),
  );
  logger.info(`Added instance '${entry.instanceId}' to warm pool for owner '${entry.runnerOwner}'`);
}

export async function removeFromWarmPool(instanceId: string): Promise<boolean> {
  const client = getClient();
  try {
    await client.send(
      new DeleteItemCommand({
        TableName: getTableName(),
        Key: { instanceId: { S: instanceId } },
        ConditionExpression: 'attribute_exists(instanceId)',
      }),
    );
    logger.info(`Removed instance '${instanceId}' from warm pool`);
    return true;
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      logger.info(`Instance '${instanceId}' already claimed from warm pool`);
      return false;
    }
    throw e;
  }
}

export async function getWarmInstance(instanceId: string): Promise<WarmPoolEntry | null> {
  const client = getClient();
  const result = await client.send(
    new GetItemCommand({
      TableName: getTableName(),
      Key: { instanceId: { S: instanceId } },
    }),
  );
  if (!result.Item) return null;
  return itemToEntry(result.Item);
}

/**
 * Reads the readiness marker an instance writes from its start script once it has registered with
 * GitHub and reached a safe-to-stop checkpoint. Returns the ISO timestamp of the signal, or null
 * when the instance has not signalled yet. Only projects `readyAt` so it also works on the partial
 * marker item that exists before the instance is fully added to the warm pool.
 */
export async function getInstanceReadyMarker(instanceId: string): Promise<string | null> {
  const client = getClient();
  const result = await client.send(
    new GetItemCommand({
      TableName: getTableName(),
      Key: { instanceId: { S: instanceId } },
      ProjectionExpression: 'readyAt',
    }),
  );
  return result.Item?.readyAt?.S ?? null;
}

export async function listWarmInstancesByOwner(runnerOwner: string): Promise<WarmPoolEntry[]> {
  const client = getClient();
  const result = await client.send(
    new QueryCommand({
      TableName: getTableName(),
      IndexName: 'by-owner',
      KeyConditionExpression: 'runnerOwner = :owner',
      ExpressionAttributeValues: {
        ':owner': { S: runnerOwner },
      },
      ScanIndexForward: true, // oldest first
    }),
  );
  return (result.Items || []).map(itemToEntry);
}

export async function countWarmInstancesByOwner(runnerOwner: string): Promise<number> {
  const client = getClient();
  const result = await client.send(
    new QueryCommand({
      TableName: getTableName(),
      IndexName: 'by-owner',
      KeyConditionExpression: 'runnerOwner = :owner',
      ExpressionAttributeValues: {
        ':owner': { S: runnerOwner },
      },
      Select: 'COUNT',
    }),
  );
  return result.Count || 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function itemToEntry(item: any): WarmPoolEntry {
  return {
    instanceId: item.instanceId.S,
    runnerOwner: item.runnerOwner.S,
    environment: item.environment.S,
    runnerType: item.runnerType.S,
    instanceType: item.instanceType?.S,
    az: item.az?.S,
    amiId: item.amiId?.S,
    stoppedAt: item.stoppedAt.S,
    expiresAt: Number(item.expiresAt.N),
  };
}

export function emitWarmPoolMetric(
  metricName:
    | 'WarmPoolInstanceStopped'
    | 'WarmPoolInstanceStarted'
    | 'WarmPoolStartFailed'
    | 'WarmPoolSize'
    | 'WarmPoolStartLatency'
    | 'WarmPoolEvicted',
  value: number,
  dimensions: Record<string, string> = {},
): void {
  const enabled = yn(process.env.ENABLE_METRIC_WARM_POOL, { default: false });
  if (!enabled) return;

  const environment = process.env.ENVIRONMENT || '';
  const unit = metricName === 'WarmPoolStartLatency' ? MetricUnit.Milliseconds : MetricUnit.Count;
  createSingleMetric(metricName, unit, value, { Environment: environment, ...dimensions });
}
