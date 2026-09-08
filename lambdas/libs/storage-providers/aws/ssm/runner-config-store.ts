import { putParameter } from '@aws-github-runner/aws-ssm-util';

import type { RunnerConfigMetadata, RunnerConfigRecord, RunnerConfigStore } from '../../core';
import type {} from './environment';
import { loadSsmParameterStoreTagsFromEnvironment } from './parameter-store-tags';

interface AwsSsmRunnerConfigStoreConfig {
  tokenPath: string;
  parameterStoreTags: { Key: string; Value: string }[];
}

export function createAwsSsmRunnerConfigStore(): RunnerConfigStore {
  const tokenPath = process.env.SSM_TOKEN_PATH;
  if (!tokenPath || tokenPath.trim() === '') {
    throw new Error('Environment variable SSM_TOKEN_PATH is not set');
  }

  return new AwsSsmRunnerConfigStore({
    tokenPath,
    parameterStoreTags: loadSsmParameterStoreTagsFromEnvironment(),
  });
}

class AwsSsmRunnerConfigStore implements RunnerConfigStore {
  readonly maxWritesPerSecond = 40;

  constructor(private readonly config: AwsSsmRunnerConfigStoreConfig) {}

  async create(record: RunnerConfigRecord, options: { metadata?: RunnerConfigMetadata[] } = {}): Promise<void> {
    await putParameter(`${this.config.tokenPath}/${record.runnerId}`, record.value, true, {
      tags: [
        ...(options.metadata ?? []).map(({ key, value }) => ({ Key: key, Value: value })),
        ...this.config.parameterStoreTags,
      ],
    });
  }
}
