import { createChildLogger } from '@aws-github-runner/aws-powertools-util';

import { ec2RunnerCountCache, dynamoDbRunnerCountCache } from './runner-count-cache';
import type { ScaleUpComputeProvider } from './types';

const logger = createChildLogger('runner-count-cache-decorator');

function cacheTableName(): string | undefined {
  const t = process.env.RUNNER_COUNT_CACHE_TABLE_NAME;
  return t && t.trim() !== '' ? t : undefined;
}

let initialized = false;
function ensureInitialized(tableName: string): void {
  if (initialized) return;
  const region = process.env.AWS_REGION;
  const staleThresholdMs = parseInt(process.env.RUNNER_COUNT_CACHE_STALE_THRESHOLD_MS || '60000', 10);
  if (region) {
    dynamoDbRunnerCountCache.initialize(tableName, region, staleThresholdMs);
    initialized = true;
  }
}

/**
 * Wraps any ScaleUpComputeProvider with the runner-count cache, tiered read:
 *   in-memory (short TTL) -> DynamoDB counter (if fresh) -> delegate to the
 *   provider's own getCurrentRunners (authoritative) on miss/stale.
 *
 * The DynamoDB counter is maintained out-of-band by the runner-count-cache
 * Lambda (EventBridge EC2 state changes), so the hot scale-up path avoids the
 * provider's expensive listing (e.g. EC2 DescribeInstances) in the common case,
 * while the fallback keeps it correct when the counter is cold or stale.
 *
 * This decorator is provider-agnostic: it operates purely on the
 * ScaleUpComputeProvider contract and never references a specific compute
 * backend. When the cache table is not configured it is a transparent
 * pass-through, so the feature stays fully opt-in.
 */
export function withRunnerCountCache<TState>(
  provider: ScaleUpComputeProvider<TState>,
): ScaleUpComputeProvider<TState> {
  const tableName = cacheTableName();
  if (!tableName) {
    return provider; // feature disabled -> no behavioural change
  }

  const wrapped: ScaleUpComputeProvider<TState> = {
    ...provider,

    getCurrentRunners: async (state, input) => {
      ensureInitialized(tableName);
      const environment = process.env.ENVIRONMENT ?? '';
      const { runnerType, runnerOwner } = input;

      // 1) in-memory (dedupes repeated reads within an invocation)
      const memo = ec2RunnerCountCache.get(environment, runnerType, runnerOwner);
      if (memo !== undefined) {
        return memo;
      }

      // 2) DynamoDB counter, if fresh
      const cached = await dynamoDbRunnerCountCache.get(environment, runnerType, runnerOwner);
      if (cached && !cached.isStale) {
        ec2RunnerCountCache.set(environment, runnerType, runnerOwner, cached.count);
        return cached.count;
      }

      // 3) miss or stale -> authoritative provider count, then memoise briefly
      if (cached?.isStale) {
        logger.debug('Runner count cache stale, falling back to provider', { environment, runnerType, runnerOwner });
      }
      const actual = await provider.getCurrentRunners(state, input);
      ec2RunnerCountCache.set(environment, runnerType, runnerOwner, actual);
      return actual;
    },

    createRunners: async (createInput) => {
      const result = await provider.createRunners(createInput);
      // New runners now exist. Drop the short-lived in-memory counts so a later
      // read in the same invocation reflects them (via the provider fallback)
      // instead of returning a pre-create value. The DynamoDB counter converges
      // shortly after via the EventBridge-driven counter Lambda.
      ec2RunnerCountCache.reset();
      return result;
    },
  };

  return wrapped;
}
