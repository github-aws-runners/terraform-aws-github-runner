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

  async get(runnerGroupName: string): Promise<number> {
    const runnerGroupId = await getParameter(this.parameterName(runnerGroupName));
    return parseInt(runnerGroupId);
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
