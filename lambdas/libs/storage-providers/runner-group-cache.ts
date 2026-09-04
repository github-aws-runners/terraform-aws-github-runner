import { createAwsSsmRunnerGroupCacheStore } from './aws/ssm/runner-group-cache-store';
import type { RunnerGroupCacheStore } from './core';

export function createRunnerGroupCacheStore(): RunnerGroupCacheStore {
  return createAwsSsmRunnerGroupCacheStore();
}
