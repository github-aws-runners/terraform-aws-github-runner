import { getParameter, putParameter } from '@aws-github-runner/aws-ssm-util';

import type { RunnerGroupCacheRecord, RunnerGroupCacheStore } from '../../core';
import type {} from './environment';
import { createAwsSsmStorageLogger, getErrorNames } from './logger';
import { loadSsmParameterStoreTagsFromEnvironment } from './parameter-store-tags';

const logger = createAwsSsmStorageLogger('runner-group-cache-store');

export interface AwsSsmRunnerGroupCacheStoreConfig {
  configPath: string;
  parameterStoreTags: ReadonlyArray<Readonly<{ Key: string; Value: string }>>;
}

export function createAwsSsmRunnerGroupCacheStore(config?: AwsSsmRunnerGroupCacheStoreConfig): RunnerGroupCacheStore {
  if (config) {
    return new AwsSsmRunnerGroupCacheStore(
      Object.freeze({
        ...config,
        parameterStoreTags: Object.freeze(config.parameterStoreTags.map((tag) => Object.freeze({ ...tag }))),
      }),
    );
  }
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
    const parameterName = this.parameterName(runnerGroupName);
    logger.debug('Reading runner group ID from cache', {
      runnerGroupName,
      parameterName,
    });

    try {
      const value = await getParameter(parameterName);
      const runnerGroupId = Number.parseInt(value, 10);
      if (Number.isNaN(runnerGroupId)) {
        throw new Error(`Cached runner group ID for ${runnerGroupName} is invalid`);
      }

      logger.debug('Runner group cache hit', {
        runnerGroupName,
        parameterName,
        runnerGroupId,
      });
      return runnerGroupId;
    } catch (error) {
      if (isParameterNotFoundError(error)) {
        logger.info('Runner group cache miss; caller will resolve the ID from GitHub', {
          runnerGroupName,
          parameterName,
          errorNames: getErrorNames(error),
        });
        return undefined;
      }

      logger.error('Runner group cache lookup failed', {
        runnerGroupName,
        parameterName,
        errorNames: getErrorNames(error),
      });
      throw error;
    }
  }

  async create(record: RunnerGroupCacheRecord): Promise<void> {
    const parameterName = this.parameterName(record.runnerGroupName);
    await putParameter(parameterName, record.runnerGroupId.toString(), false, {
      tags: [...this.config.parameterStoreTags],
    });
    logger.info('Stored runner group ID in cache', {
      runnerGroupName: record.runnerGroupName,
      parameterName,
      runnerGroupId: record.runnerGroupId,
    });
  }

  private parameterName(runnerGroupName: string): string {
    return `${this.config.configPath}/runner-group/${runnerGroupName}`;
  }
}

function isParameterNotFoundError(error: unknown): boolean {
  return getErrorNames(error).includes('ParameterNotFound');
}
