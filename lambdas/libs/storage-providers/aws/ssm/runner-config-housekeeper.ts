import {
  DeleteParameterCommand,
  GetParametersByPathCommand,
  SSMClient,
  type GetParametersByPathCommandOutput,
} from '@aws-sdk/client-ssm';
import { getTracedAWSV3Client } from '@aws-github-runner/aws-powertools-util';

import type { RunnerConfigHousekeeper } from '../../core';
import { createAwsSsmStorageLogger, getErrorNames } from './logger';

const logger = createAwsSsmStorageLogger('runner-config-housekeeper');

export interface SSMCleanupOptions {
  dryRun: boolean;
  minimumDaysOld: number;
  tokenPath: string;
}

export function createAwsSsmRunnerConfigHousekeeper(options?: SSMCleanupOptions): RunnerConfigHousekeeper {
  return new AwsSsmRunnerConfigHousekeeper(options ?? loadCleanupOptions());
}

export async function cleanSSMTokens(options: SSMCleanupOptions): Promise<void> {
  validateOptions(options);
  logger.info('Cleaning expired runner configurations', {
    minimumDaysOld: options.minimumDaysOld,
    dryRun: options.dryRun,
    tokenPath: options.tokenPath,
  });

  const client = getTracedAWSV3Client(new SSMClient({ region: process.env.AWS_REGION }));
  let parameters: GetParametersByPathCommandOutput;
  try {
    parameters = await client.send(new GetParametersByPathCommand({ Path: options.tokenPath }));
    while (parameters.NextToken) {
      const nextParameters = await client.send(
        new GetParametersByPathCommand({ Path: options.tokenPath, NextToken: parameters.NextToken }),
      );
      parameters.Parameters?.push(...(nextParameters.Parameters ?? []));
      parameters.NextToken = nextParameters.NextToken;
    }
  } catch (error) {
    logger.error('Failed to list runner configurations', {
      tokenPath: options.tokenPath,
      errorNames: getErrorNames(error),
    });
    throw error;
  }
  logger.info('Found runner configurations', {
    tokenPath: options.tokenPath,
    parameterCount: parameters.Parameters?.length ?? 0,
  });

  const minimumDate = new Date();
  minimumDate.setDate(minimumDate.getDate() - options.minimumDaysOld);

  for (const parameter of parameters.Parameters ?? []) {
    if (parameter.LastModifiedDate && new Date(parameter.LastModifiedDate) < minimumDate) {
      logger.info('Deleting expired runner configuration', {
        parameterName: parameter.Name,
        lastModifiedDate: parameter.LastModifiedDate,
        dryRun: options.dryRun,
      });
      try {
        if (!options.dryRun) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          await client.send(new DeleteParameterCommand({ Name: parameter.Name }));
        }
      } catch (error) {
        logger.warn('Failed to delete expired runner configuration', {
          parameterName: parameter.Name,
          errorNames: getErrorNames(error),
        });
      }
    } else {
      logger.debug('Skipping runner configuration that is not expired', {
        parameterName: parameter.Name,
        lastModifiedDate: parameter.LastModifiedDate,
      });
    }
  }
}

class AwsSsmRunnerConfigHousekeeper implements RunnerConfigHousekeeper {
  constructor(private readonly options: SSMCleanupOptions) {}

  houseKeeper(): Promise<void> {
    return cleanSSMTokens(this.options);
  }
}

function loadCleanupOptions(): SSMCleanupOptions {
  const value = process.env.SSM_CLEANUP_CONFIG;
  if (!value || value.trim() === '') {
    throw new Error('Environment variable SSM_CLEANUP_CONFIG is not set');
  }
  return JSON.parse(value) as SSMCleanupOptions;
}

function validateOptions(options: SSMCleanupOptions): void {
  const errorMessages: string[] = [];
  if (!options.minimumDaysOld || options.minimumDaysOld < 1) {
    errorMessages.push(`minimumDaysOld must be greater then 0, value is set to "${options.minimumDaysOld}"`);
  }
  if (!options.tokenPath) {
    errorMessages.push('tokenPath must be defined');
  }
  if (errorMessages.length > 0) {
    throw new Error(errorMessages.join(', '));
  }
}
