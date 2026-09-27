import { putParameter } from '@aws-github-runner/aws-ssm-util';

import type { RunnerConfigMetadata, RunnerConfigRecord, RunnerConfigStore } from '../../core';
import type {} from './environment';
import { createAwsSsmStorageLogger, getErrorNames } from './logger';
import { loadSsmParameterStoreTagsFromEnvironment } from './parameter-store-tags';

import { parseSsmTokenTtlSeconds } from './token-ttl';

const logger = createAwsSsmStorageLogger('runner-config-store');

export interface AwsSsmRunnerConfigStoreConfig {
  tokenPath: string;
  tokenTtlSeconds?: number;
  parameterStoreTags: ReadonlyArray<Readonly<{ Key: string; Value: string }>>;
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
    tokenTtlSeconds: parseSsmTokenTtlSeconds(process.env.SSM_TOKEN_TTL_SECONDS),
    parameterStoreTags: loadSsmParameterStoreTagsFromEnvironment(),
  });
}

class AwsSsmRunnerConfigStore implements RunnerConfigStore {
  readonly maxWritesPerSecond = 40;

  constructor(private readonly config: AwsSsmRunnerConfigStoreConfig) {}

  async create(record: RunnerConfigRecord, options: { metadata?: RunnerConfigMetadata[] } = {}): Promise<void> {
    const parameterName = `${this.config.tokenPath}/${record.runnerId}`;
    logger.debug('Writing runner configuration', {
      runnerId: record.runnerId,
      parameterName,
    });

    try {
      await putParameter(parameterName, record.value, true, {
        ttlSeconds: this.config.tokenTtlSeconds,
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
