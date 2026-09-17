import { putParameter } from '@aws-github-runner/aws-ssm-util';

import type { RunnerConfigMetadata, RunnerConfigRecord, RunnerConfigStore } from '../../core';
import type {} from './environment';
import { createAwsSsmStorageLogger, getErrorNames } from './logger';
import { loadSsmParameterStoreTagsFromEnvironment } from './parameter-store-tags';

const logger = createAwsSsmStorageLogger('runner-config-store');

// SSM Parameter Store's standard-tier default; accounts that enabled the higher-throughput tier
// (up to several thousand TPS) should override this via SSM_PARAMETER_STORE_MAX_WRITES_PER_SECOND.
const DEFAULT_MAX_WRITES_PER_SECOND = 40;

export function resolveMaxWritesPerSecond(rawValue: string | undefined): number {
  const parsed = parseInt(rawValue ?? '', 10);
  return parsed > 0 ? parsed : DEFAULT_MAX_WRITES_PER_SECOND;
}

export interface AwsSsmRunnerConfigStoreConfig {
  tokenPath: string;
  parameterStoreTags: ReadonlyArray<Readonly<{ Key: string; Value: string }>>;
  maxWritesPerSecond?: number;
}

export function createAwsSsmRunnerConfigStore(config?: AwsSsmRunnerConfigStoreConfig): RunnerConfigStore {
  if (config) {
    return new AwsSsmRunnerConfigStore(
      Object.freeze({
        ...config,
        parameterStoreTags: Object.freeze(config.parameterStoreTags.map((tag) => Object.freeze({ ...tag }))),
      }),
    );
  }
  const tokenPath = process.env.SSM_TOKEN_PATH;
  if (!tokenPath || tokenPath.trim() === '') {
    throw new Error('Environment variable SSM_TOKEN_PATH is not set');
  }

  return new AwsSsmRunnerConfigStore({
    tokenPath,
    parameterStoreTags: loadSsmParameterStoreTagsFromEnvironment(),
    maxWritesPerSecond: resolveMaxWritesPerSecond(process.env.SSM_PARAMETER_STORE_MAX_WRITES_PER_SECOND),
  });
}

class AwsSsmRunnerConfigStore implements RunnerConfigStore {
  readonly maxWritesPerSecond: number;

  constructor(private readonly config: AwsSsmRunnerConfigStoreConfig) {
    this.maxWritesPerSecond = config.maxWritesPerSecond ?? DEFAULT_MAX_WRITES_PER_SECOND;
  }

  async create(record: RunnerConfigRecord, options: { metadata?: RunnerConfigMetadata[] } = {}): Promise<void> {
    const parameterName = `${this.config.tokenPath}/${record.runnerId}`;
    logger.debug('Writing runner configuration', {
      runnerId: record.runnerId,
      parameterName,
    });

    try {
      await putParameter(parameterName, record.value, true, {
        tags: [
          ...(options.metadata ?? []).map(({ key, value }) => ({ Key: key, Value: value })),
          ...this.config.parameterStoreTags,
        ],
      });
    } catch (error) {
      logger.error('Failed to write runner configuration', {
        runnerId: record.runnerId,
        parameterName,
        errorNames: getErrorNames(error),
      });
      throw error;
    }

    logger.debug('Stored runner configuration', {
      runnerId: record.runnerId,
      parameterName,
    });
  }
}
