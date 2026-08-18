import { putParameter } from '@aws-github-runner/aws-ssm-util';

import type { RunnerConfigMetadata, RunnerConfigRecord, RunnerConfigStore } from '../../core';
import type {} from './environment';
import { loadSsmParameterStoreTagsFromEnvironment } from './parameter-store-tags';
import { cleanSsmRunnerConfigs, type SsmRunnerConfigCleanupOptions } from './runner-config-housekeeper';

interface AwsSsmRunnerConfigStoreConfig {
  tokenPath?: string;
  parameterStoreTags: { Key: string; Value: string }[];
  cleanupOptions?: SsmRunnerConfigCleanupOptions;
}

export function createAwsSsmRunnerConfigStore(): RunnerConfigStore {
  const tokenPath = process.env.SSM_TOKEN_PATH;
  const cleanupOptions =
    process.env.SSM_CLEANUP_CONFIG !== undefined
      ? (JSON.parse(process.env.SSM_CLEANUP_CONFIG) as SsmRunnerConfigCleanupOptions)
      : undefined;
  const hasWriterConfig = tokenPath !== undefined && tokenPath.trim() !== '';

  if (!hasWriterConfig && cleanupOptions === undefined) {
    throw new Error('Environment variable SSM_TOKEN_PATH is not set');
  }

  return new AwsSsmRunnerConfigStore({
    tokenPath: hasWriterConfig ? tokenPath : undefined,
    parameterStoreTags: hasWriterConfig ? loadSsmParameterStoreTagsFromEnvironment() : [],
    cleanupOptions,
  });
}

class AwsSsmRunnerConfigStore implements RunnerConfigStore {
  readonly maxWritesPerSecond = 40;

  constructor(private readonly config: AwsSsmRunnerConfigStoreConfig) {}

  async create(record: RunnerConfigRecord, options: { metadata?: RunnerConfigMetadata[] } = {}): Promise<void> {
    if (!this.config.tokenPath) {
      throw new Error('Environment variable SSM_TOKEN_PATH is not set');
    }

    await putParameter(`${this.config.tokenPath}/${record.runnerId}`, record.value, true, {
      tags: [
        ...(options.metadata ?? []).map(({ key, value }) => ({ Key: key, Value: value })),
        ...this.config.parameterStoreTags,
      ],
    });
  }

  async houseKeeper(): Promise<void> {
    if (!this.config.cleanupOptions) {
      throw new Error('Environment variable SSM_CLEANUP_CONFIG is not set');
    }

    await cleanSsmRunnerConfigs(this.config.cleanupOptions);
  }
}
