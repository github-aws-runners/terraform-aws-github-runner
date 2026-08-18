import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { Octokit } from '@octokit/rest';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';

const logger = createChildLogger('cache');

export type UnboxPromise<T> = T extends Promise<infer U> ? U : T;

export type GhRunners = UnboxPromise<ReturnType<Octokit['actions']['listSelfHostedRunnersForRepo']>>['data']['runners'];

export class githubCache {
  static clients: Map<string, Octokit> = new Map();
  static runners: Map<string, GhRunners> = new Map();

  public static reset(): void {
    githubCache.clients.clear();
    githubCache.runners.clear();
  }
}

/**
 * Cache entry for EC2 runner counts with TTL support.
 * This cache helps reduce EC2 DescribeInstances API calls during scale-up operations,
 * addressing rate limiting issues in high-volume environments (Issue #4710).
 */
interface EC2RunnerCountCacheEntry {
  count: number;
  timestamp: number;
}

/**
 * In-memory cache for EC2 runner counts to mitigate EC2 API rate limiting.
 *
 * This cache stores the count of active runners per environment/type/owner combination
 * with a configurable TTL. Within a single Lambda invocation processing batch messages,
 * this prevents redundant DescribeInstances calls for the same owner group.
 *
 * The cache is designed to be slightly stale (short TTL) to reduce API load while
 * maintaining accuracy for scaling decisions. In high-throughput environments (20K+ runners/day),
 * this can significantly reduce EC2 API throttling issues.
 *
 * @see https://github.com/github-aws-runners/terraform-aws-github-runner/issues/4710
 */
export class ec2RunnerCountCache {
  private static counts: Map<string, EC2RunnerCountCacheEntry> = new Map();

  /**
   * Default TTL in milliseconds. 5 seconds provides a good balance between
   * reducing API calls and maintaining accuracy for scaling decisions.
   */
  private static DEFAULT_TTL_MS = 5000;

  /**
   * Resets the cache. Called at the start of each Lambda invocation to ensure
   * fresh data for new invocations while still benefiting from caching within
   * a single invocation processing multiple messages.
   */
  public static reset(): void {
    ec2RunnerCountCache.counts.clear();
  }

  /**
   * Generates a cache key from the filter parameters.
   * Format: "environment#runnerType#runnerOwner"
   */
  private static generateKey(environment: string, runnerType: string, runnerOwner: string): string {
    return `${environment}#${runnerType}#${runnerOwner}`;
  }

  /**
   * Gets the cached runner count if available and not expired.
   *
   * @param environment - The deployment environment (e.g., "prod", "dev")
   * @param runnerType - The runner type ("Org" or "Repo")
   * @param runnerOwner - The owner (org name or owner/repo)
   * @param ttlMs - Optional custom TTL in milliseconds
   * @returns The cached count or undefined if not cached or expired
   */
  public static get(
    environment: string,
    runnerType: string,
    runnerOwner: string,
    ttlMs: number = ec2RunnerCountCache.DEFAULT_TTL_MS,
  ): number | undefined {
    const key = ec2RunnerCountCache.generateKey(environment, runnerType, runnerOwner);
    const cached = ec2RunnerCountCache.counts.get(key);

    if (cached && Date.now() - cached.timestamp < ttlMs) {
      return cached.count;
    }

    // Entry expired or not found, remove it
    if (cached) {
      ec2RunnerCountCache.counts.delete(key);
    }

    return undefined;
  }

  /**
   * Sets the runner count in the cache.
   *
   * @param environment - The deployment environment
   * @param runnerType - The runner type
   * @param runnerOwner - The owner
   * @param count - The current count of runners
   */
  public static set(environment: string, runnerType: string, runnerOwner: string, count: number): void {
    const key = ec2RunnerCountCache.generateKey(environment, runnerType, runnerOwner);
    ec2RunnerCountCache.counts.set(key, {
      count,
      timestamp: Date.now(),
    });
  }

  /**
   * Increments the cached count by a specified amount.
   * Used after successfully creating new runners to keep the cache accurate
   * without requiring a new DescribeInstances call.
   *
   * @param environment - The deployment environment
   * @param runnerType - The runner type
   * @param runnerOwner - The owner
   * @param increment - The number to add to the current count
   */
  public static increment(environment: string, runnerType: string, runnerOwner: string, increment: number): void {
    const key = ec2RunnerCountCache.generateKey(environment, runnerType, runnerOwner);
    const cached = ec2RunnerCountCache.counts.get(key);

    if (cached) {
      cached.count += increment;
      cached.timestamp = Date.now();
    }
  }

  /**
   * Gets the current cache size (for debugging/metrics).
   */
  public static size(): number {
    return ec2RunnerCountCache.counts.size;
  }
}

/**
 * DynamoDB-based persistent cache for EC2 runner counts.
 *
 * This cache reads from a DynamoDB table that is updated by an EventBridge-triggered
 * Lambda function when EC2 instances change state. This provides cross-invocation
 * consistency and eliminates EC2 DescribeInstances calls entirely.
 *
 * The table is expected to have:
 * - pk (partition key): "environment#type#owner" format
 * - count: atomic counter of active runners
 * - updated: timestamp of last update
 *
 * @see https://github.com/github-aws-runners/terraform-aws-github-runner/issues/4710
 */
export class dynamoDbRunnerCountCache {
  private static dynamoClient: DynamoDBClient | null = null;
  private static tableName: string | null = null;
  private static staleThresholdMs: number = 60000; // 1 minute default

  /**
   * Initializes the DynamoDB cache with the required configuration.
   * Should be called once at Lambda startup if the cache table is configured.
   */
  public static initialize(tableName: string, region: string, staleThresholdMs?: number): void {
    dynamoDbRunnerCountCache.tableName = tableName;
    dynamoDbRunnerCountCache.dynamoClient = new DynamoDBClient({ region });
    if (staleThresholdMs !== undefined) {
      dynamoDbRunnerCountCache.staleThresholdMs = staleThresholdMs;
    }
    logger.debug('DynamoDB runner count cache initialized', { tableName, staleThresholdMs });
  }

  /**
   * Checks if the DynamoDB cache is enabled and initialized.
   */
  public static isEnabled(): boolean {
    return dynamoDbRunnerCountCache.tableName !== null && dynamoDbRunnerCountCache.dynamoClient !== null;
  }

  /**
   * Generates a cache key from the filter parameters.
   * Format: "environment#runnerType#runnerOwner"
   */
  private static generateKey(environment: string, runnerType: string, runnerOwner: string): string {
    return `${environment}#${runnerType}#${runnerOwner}`;
  }

  /**
   * Gets the runner count from DynamoDB if available and not stale.
   *
   * @param environment - The deployment environment
   * @param runnerType - The runner type ("Org" or "Repo")
   * @param runnerOwner - The owner (org name or owner/repo)
   * @returns Object with count and isStale flag, or null if not found
   */
  public static async get(
    environment: string,
    runnerType: string,
    runnerOwner: string,
  ): Promise<{ count: number; isStale: boolean } | null> {
    if (!dynamoDbRunnerCountCache.isEnabled()) {
      return null;
    }

    const pk = dynamoDbRunnerCountCache.generateKey(environment, runnerType, runnerOwner);

    try {
      const result = await dynamoDbRunnerCountCache.dynamoClient!.send(
        new GetItemCommand({
          TableName: dynamoDbRunnerCountCache.tableName!,
          Key: {
            pk: { S: pk },
          },
        }),
      );

      if (!result.Item) {
        logger.debug('No DynamoDB cache entry found', { pk });
        return null;
      }

      const count = parseInt(result.Item.count?.N || '0', 10);
      const updated = parseInt(result.Item.updated?.N || '0', 10);
      const isStale = Date.now() - updated > dynamoDbRunnerCountCache.staleThresholdMs;

      logger.debug('DynamoDB cache hit', { pk, count, isStale, ageMs: Date.now() - updated });

      // Normalize negative counts to zero. This can happen due to race conditions with
      // EventBridge events (e.g., termination event arrives before running event).
      if (count < 0) {
        logger.warn('DynamoDB cache returned negative count, normalizing to 0', {
          pk,
          rawCount: count,
          updated,
        });
      }

      return { count: Math.max(0, count), isStale };
    } catch (error) {
      logger.warn('Failed to read from DynamoDB cache', { pk, error });
      return null;
    }
  }

  /**
   * Resets the cache configuration (primarily for testing).
   */
  public static reset(): void {
    dynamoDbRunnerCountCache.dynamoClient = null;
    dynamoDbRunnerCountCache.tableName = null;
    dynamoDbRunnerCountCache.staleThresholdMs = 60000;
  }
}
