import { DeleteParameterCommand, GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
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

export async function cleanSSMTokens(options: SSMCleanupOptions, remainingTime = () => Infinity): Promise<void> {
  validateOptions(options);
  logger.info('Cleaning expired runner configurations', {
    minimumDaysOld: options.minimumDaysOld,
    dryRun: options.dryRun,
    tokenPath: options.tokenPath,
  });

  const client = getTracedAWSV3Client(new SSMClient({ region: process.env.AWS_REGION }));
  let nextToken: string | undefined;
  const minimumDate = new Date();
  minimumDate.setDate(minimumDate.getDate() - options.minimumDaysOld);
  do {
    if (remainingTime() < 10000) return;
    const page = await client.send(new GetParametersByPathCommand({ Path: options.tokenPath, NextToken: nextToken }));
    for (const parameter of page.Parameters ?? []) {
      if (remainingTime() < 10000) return;
      if (!parameter.Name || !parameter.LastModifiedDate || !(new Date(parameter.LastModifiedDate) < minimumDate))
        continue;
      logger.info('Deleting expired runner configuration', { parameterName: parameter.Name, dryRun: options.dryRun });
      try {
        if (!options.dryRun) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          await client.send(new DeleteParameterCommand({ Name: parameter.Name }));
        }
      } catch (error) {
        // Failed items remain in the inventory for the next complete sweep.
        logger.warn('Failed to delete expired runner configuration', {
          parameterName: parameter.Name,
          errorNames: getErrorNames(error),
        });
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);
}

class AwsSsmRunnerConfigHousekeeper implements RunnerConfigHousekeeper {
  constructor(private readonly options: SSMCleanupOptions) {}

  houseKeeper(remainingTime?: () => number): Promise<void> {
    return cleanSSMTokens(this.options, remainingTime);
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
