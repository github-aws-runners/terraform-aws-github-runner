import { deleteParameter, putParameter } from '@aws-github-runner/aws-ssm-util';

import type { RunnerConfigMetadata, RunnerConfigRecord, RunnerConfigStore } from '../../core';
import type {} from './environment';
import { createAwsSsmStorageLogger, getErrorNames } from './logger';
import { loadSsmParameterStoreTagsFromEnvironment } from './parameter-store-tags';

const logger = createAwsSsmStorageLogger('runner-config-store');

export interface AwsSsmRunnerConfigStoreConfig {
  tokenPath: string;
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

    const tags = [
      ...(options.metadata ?? []).map(({ key, value }) => ({ Key: key, Value: value })),
      ...this.config.parameterStoreTags,
    ];

    try {
      await putParameter(parameterName, record.value, true, { tags });
    } catch (error) {
      // A warm-pool restart reuses the same instance ID (and therefore the same parameter name).
      // If the prior boot never reached its own delete-parameter step (e.g. it was stopped for the
      // warm pool before finishing), the stale value blocks this write. Clear it and retry once.
      if (isParameterAlreadyExistsError(error)) {
        logger.warn('Runner configuration parameter already exists; clearing stale value and retrying', {
          runnerId: record.runnerId,
          parameterName,
          errorNames: getErrorNames(error),
        });
        await deleteParameter(parameterName);
        try {
          await putParameter(parameterName, record.value, true, { tags });
        } catch (retryError) {
          logger.error('Failed to write runner configuration after clearing stale value', {
            runnerId: record.runnerId,
            parameterName,
            errorNames: getErrorNames(retryError),
          });
          throw retryError;
        }
        logger.debug('Stored runner configuration', {
          runnerId: record.runnerId,
          parameterName,
        });
        return;
      }

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

function isParameterAlreadyExistsError(error: unknown): boolean {
  return getErrorNames(error).includes('ParameterAlreadyExists');
}
