import { createAwsSsmRunnerConfigStore } from './aws/ssm/runner-config-store';
import type { RunnerConfigStore } from './core';
import type {} from './environment';

export function createRunnerConfigStore(): RunnerConfigStore {
  return createAwsSsmRunnerConfigStore();
}
