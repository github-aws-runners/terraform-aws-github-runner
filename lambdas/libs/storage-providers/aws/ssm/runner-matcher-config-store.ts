import { getParameter, getParameters } from '@aws-github-runner/aws-ssm-util';

import type { RunnerMatcherConfigStore } from '../../core';
import type {} from './environment';

export function createAwsSsmRunnerMatcherConfigStore(): RunnerMatcherConfigStore {
  const parameterPaths = process.env.PARAMETER_RUNNER_MATCHER_CONFIG_PATH;
  if (!parameterPaths || parameterPaths.trim() === '') {
    throw new Error('Environment variable PARAMETER_RUNNER_MATCHER_CONFIG_PATH is not set');
  }

  const paths = parameterPaths
    .split(':')
    .map((path) => path.trim())
    .filter(Boolean);

  if (paths.length === 0) {
    throw new Error('Environment variable PARAMETER_RUNNER_MATCHER_CONFIG_PATH is not set');
  }

  return new AwsSsmRunnerMatcherConfigStore(paths);
}

class AwsSsmRunnerMatcherConfigStore implements RunnerMatcherConfigStore {
  constructor(private readonly parameterPaths: string[]) {}

  async get(): Promise<string> {
    if (this.parameterPaths.length === 1) {
      const path = this.parameterPaths[0];
      try {
        return await getParameter(path);
      } catch (error) {
        throw new Error(`Failed to load parameter for matcherConfig from path ${path}: ${(error as Error).message}`);
      }
    }

    let parameters: Map<string, string>;
    try {
      parameters = await getParameters(this.parameterPaths);
    } catch (error) {
      throw new Error(`Failed to load/parse combined matcher config: ${(error as Error).message}`);
    }

    let combined = '';
    const errors: string[] = [];
    for (const path of this.parameterPaths) {
      const value = parameters.get(path);
      if (value) {
        combined += value;
      } else {
        errors.push(`Failed to load parameter for matcherConfig from path ${path}: Parameter not found`);
      }
    }

    if (combined) {
      try {
        JSON.parse(combined);
      } catch (error) {
        errors.push(`Failed to load/parse combined matcher config: ${(error as Error).message}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join(', '));
    }

    return combined;
  }
}
