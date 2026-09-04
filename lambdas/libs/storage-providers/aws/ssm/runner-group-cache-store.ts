import { getParameter, putParameter } from '@aws-github-runner/aws-ssm-util';

import type { RunnerGroupCacheRecord, RunnerGroupCacheStore } from '../../core';
import type {} from './environment';
import { loadSsmParameterStoreTagsFromEnvironment } from './parameter-store-tags';

interface AwsSsmRunnerGroupCacheStoreConfig {
  configPath: string;
  parameterStoreTags: { Key: string; Value: string }[];
}

export function createAwsSsmRunnerGroupCacheStore(): RunnerGroupCacheStore {
  const configPath = process.env.SSM_CONFIG_PATH;
  if (!configPath || configPath.trim() === '') {
    throw new Error('Environment variable SSM_CONFIG_PATH is not set');
  }

  return new AwsSsmRunnerGroupCacheStore({
    configPath,
    parameterStoreTags: loadSsmParameterStoreTagsFromEnvironment(),
  });
}

class AwsSsmRunnerGroupCacheStore implements RunnerGroupCacheStore {
  constructor(private readonly config: AwsSsmRunnerGroupCacheStoreConfig) {}

  async get(runnerGroupName: string): Promise<number | undefined> {
    try {
      const value = await getParameter(this.parameterName(runnerGroupName));
      const runnerGroupId = Number.parseInt(value, 10);
      if (Number.isNaN(runnerGroupId)) {
        throw new Error(`Cached runner group ID for ${runnerGroupName} is invalid`);
      }
      return runnerGroupId;
    } catch (error) {
      if (error !== null && typeof error === 'object' && 'name' in error && error.name === 'ParameterNotFound') {
        return undefined;
      }
      throw error;
    }
  }

  async create(record: RunnerGroupCacheRecord): Promise<void> {
    await putParameter(this.parameterName(record.runnerGroupName), record.runnerGroupId.toString(), false, {
      tags: this.config.parameterStoreTags,
    });
  }

  private parameterName(runnerGroupName: string): string {
    return `${this.config.configPath}/runner-group/${runnerGroupName}`;
  }
}
