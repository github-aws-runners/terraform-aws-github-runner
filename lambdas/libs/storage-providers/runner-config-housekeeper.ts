import { createAwsSsmRunnerConfigHousekeeper } from './aws/ssm/runner-config-housekeeper';
import type { RunnerConfigHousekeeper } from './core';

export function createRunnerConfigHousekeeper(): RunnerConfigHousekeeper {
  return createAwsSsmRunnerConfigHousekeeper();
}
