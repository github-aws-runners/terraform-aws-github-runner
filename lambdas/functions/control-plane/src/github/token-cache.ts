import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';

const logger = createChildLogger('installation-token-cache');

// Refresh token when it has less than this much life left. GitHub tokens are
// valid for 60 minutes; refreshing at 50 min left = 10 min before expiry
// provides buffer for clock skew, in-flight requests, and any temporarily
// failing refresh attempt.
const REFRESH_AHEAD_MS = 10 * 60 * 1000;

// How long the mint-in-progress lock lives if the holder crashes. Must be
// > Octokit HTTP timeout so a slow successful mint doesn't race a duplicate.
const LOCK_TTL_MS = 60 * 1000;

// Token lifetime written to the cache. GitHub tokens are valid for ~60 min;
// we record 58 to provide a consumer-side safety margin.
const TOKEN_TTL_MS = 58 * 60 * 1000;

// Wait this long for the lock holder to finish on a cache miss before
// re-reading. Jittered to avoid thundering herd on the cache re-read.
const COLD_MISS_WAIT_MIN_MS = 200;
const COLD_MISS_WAIT_MAX_MS = 1000;

const ddb = new DynamoDBClient({});

export interface CachedInstallationToken {
  token: string;
  expiresAt: Date;
}

interface CacheEntry {
  token?: string;
  expiresAtMs?: number;
  lockUntilMs?: number;
}

/**
 * Returns a valid installation access token, using the DynamoDB-backed cache
 * when possible. The token-mint function is provided by the caller — this
 * module is concerned only with caching, locking, and refresh-ahead.
 *
 * Three behavioural cases:
 *   A. Cache hit, well before expiry: return cached token, no GitHub call.
 *   B. Cache hit, approaching expiry (within REFRESH_AHEAD_MS):
 *      one Lambda wins a refresh lock and mints synchronously; others
 *      return the still-valid cached token without waiting.
 *   C. Cache miss / expired: one Lambda wins the lock and mints; others
 *      sleep briefly and re-read the cache, falling back to a direct mint
 *      only as a last resort if the winner failed.
 *
 * On mint failure, the lock is intentionally NOT released so it expires
 * naturally after LOCK_TTL_MS. This caps mint attempts at one per
 * LOCK_TTL_MS during sustained upstream failures.
 */
export async function getCachedInstallationToken(
  installationId: number,
  mintToken: () => Promise<{ token: string; expiresAt: string }>,
): Promise<CachedInstallationToken> {
  const tableName = process.env.INSTALLATION_TOKEN_TABLE_NAME;
  if (!tableName) {
    // Cache disabled — mint directly.
    const minted = await mintToken();
    return { token: minted.token, expiresAt: new Date(minted.expiresAt) };
  }

  const now = Date.now();
  const cached = await readCacheEntry(tableName, installationId);

  // Case A: fresh cache hit, well before expiry → use it.
  if (cached?.token && cached.expiresAtMs && cached.expiresAtMs > now + REFRESH_AHEAD_MS) {
    logger.debug('Installation token cache hit', { installationId });
    return { token: cached.token, expiresAt: new Date(cached.expiresAtMs) };
  }

  // Case B: still valid but approaching expiry → refresh-ahead.
  if (cached?.token && cached.expiresAtMs && cached.expiresAtMs > now) {
    const acquired = await tryAcquireRefreshLock(tableName, installationId, now, cached);
    if (acquired) {
      logger.info('Refreshing installation token (refresh-ahead)', { installationId });
      return await mintAndStore(tableName, installationId, mintToken);
    } else {
      logger.debug('Another Lambda is refreshing; using cached token', { installationId });
      return { token: cached.token, expiresAt: new Date(cached.expiresAtMs) };
    }
  }

  // Case C: cache miss or fully expired → must mint, blocking. Single-flight.
  const acquired = await tryAcquireRefreshLock(tableName, installationId, now, cached);
  if (acquired) {
    logger.info('Minting installation token (cold cache)', { installationId });
    return await mintAndStore(tableName, installationId, mintToken);
  }

  // Lock is held by another Lambda — wait briefly and re-read.
  const jitter = COLD_MISS_WAIT_MIN_MS + Math.random() * (COLD_MISS_WAIT_MAX_MS - COLD_MISS_WAIT_MIN_MS);
  await sleep(jitter);
  const retried = await readCacheEntry(tableName, installationId);
  if (retried?.token && retried.expiresAtMs && retried.expiresAtMs > Date.now()) {
    logger.debug('Installation token populated by lock holder', { installationId });
    return { token: retried.token, expiresAt: new Date(retried.expiresAtMs) };
  }

  // Winner finished and either failed or cache is stale. Mint directly as a
  // last resort — accepts the rare double-mint to ensure forward progress.
  logger.warn('Lock holder did not populate cache; minting fallback', { installationId });
  return await mintAndStore(tableName, installationId, mintToken);
}

async function readCacheEntry(tableName: string, installationId: number): Promise<CacheEntry | undefined> {
  try {
    const out = await ddb.send(
      new GetItemCommand({
        TableName: tableName,
        Key: { installation_id: { N: String(installationId) } },
        ConsistentRead: true,
      }),
    );
    if (!out.Item) return undefined;
    return {
      token: out.Item.token?.S,
      expiresAtMs: out.Item.expires_at_ms?.N ? Number(out.Item.expires_at_ms.N) : undefined,
      lockUntilMs: out.Item.lock_until_ms?.N ? Number(out.Item.lock_until_ms.N) : undefined,
    };
  } catch (e) {
    logger.warn('Token cache read failed; falling through to mint', { installationId, error: e });
    return undefined;
  }
}

/**
 * Atomically acquire the mint lock by setting `lock_until_ms` only if no
 * other lock is currently active. Returns true if we won the race.
 */
async function tryAcquireRefreshLock(
  tableName: string,
  installationId: number,
  nowMs: number,
  current: CacheEntry | undefined,
): Promise<boolean> {
  const lockUntil = nowMs + LOCK_TTL_MS;
  try {
    await ddb.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: { installation_id: { N: String(installationId) } },
        UpdateExpression: 'SET lock_until_ms = :lockUntil',
        // Acquire if:
        //   1. No item exists, OR no lock, OR current lock expired
        //   AND
        //   2. No valid token exists (or token is within the refresh-ahead window)
        ConditionExpression:
          '(attribute_not_exists(installation_id) OR attribute_not_exists(lock_until_ms) OR lock_until_ms < :now)' +
          ' AND ' +
          '(attribute_not_exists(expires_at_ms) OR expires_at_ms < :refreshAt)',
        ExpressionAttributeValues: {
          ':lockUntil': { N: String(lockUntil) },
          ':now': { N: String(nowMs) },
          ':refreshAt': { N: String(nowMs + REFRESH_AHEAD_MS) },
        },
      }),
    );
    return true;
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      return false;
    }
    logger.warn('Lock acquire failed unexpectedly; falling through', {
      installationId,
      error: e,
      hadCachedToken: Boolean(current?.token),
    });
    return false;
  }
}

/**
 * Calls the supplied `mintToken` function, writes the result to DDB, and
 * releases the lock. On failure does NOT release the lock — natural backoff
 * via the lock TTL prevents thundering herd against a struggling upstream.
 */
async function mintAndStore(
  tableName: string,
  installationId: number,
  mintToken: () => Promise<{ token: string; expiresAt: string }>,
): Promise<CachedInstallationToken> {
  const minted = await mintToken();
  const expiresAtMs = Math.min(new Date(minted.expiresAt).getTime(), Date.now() + TOKEN_TTL_MS);

  try {
    await ddb.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          installation_id: { N: String(installationId) },
          token: { S: minted.token },
          expires_at_ms: { N: String(expiresAtMs) },
          // DynamoDB TTL operates on epoch seconds; let DDB clean up old
          // entries automatically a few minutes after expiry.
          ttl: { N: String(Math.floor(expiresAtMs / 1000) + 600) },
          // lock_until_ms is intentionally left unset — clears the lock.
        },
      }),
    );
  } catch (e) {
    logger.warn('Token cache write failed; token still returned to caller', {
      installationId,
      error: e,
    });
  }

  return { token: minted.token, expiresAt: new Date(expiresAtMs) };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
