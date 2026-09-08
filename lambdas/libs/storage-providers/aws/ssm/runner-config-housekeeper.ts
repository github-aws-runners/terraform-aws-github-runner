import { DeleteParameterCommand, GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import { getTracedAWSV3Client, logger } from '@aws-github-runner/aws-powertools-util';

import type { RunnerConfigHousekeeper } from '../../core';

export interface SSMCleanupOptions {
  dryRun: boolean;
  minimumDaysOld: number;
  tokenPath: string;
}

export function createAwsSsmRunnerConfigHousekeeper(options?: SSMCleanupOptions): RunnerConfigHousekeeper {
  return new AwsSsmRunnerConfigHousekeeper(options ?? loadCleanupOptions());
}

export async function cleanSSMTokens(options: SSMCleanupOptions): Promise<void> {
  logger.info(`Cleaning tokens / JIT config older then ${options.minimumDaysOld} days, dryRun: ${options.dryRun}`);
  logger.debug('Cleaning with options', { options });
  validateOptions(options);

  const client = getTracedAWSV3Client(new SSMClient({ region: process.env.AWS_REGION }));
  const parameters = await client.send(new GetParametersByPathCommand({ Path: options.tokenPath }));
  while (parameters.NextToken) {
    const nextParameters = await client.send(
      new GetParametersByPathCommand({ Path: options.tokenPath, NextToken: parameters.NextToken }),
    );
    parameters.Parameters?.push(...(nextParameters.Parameters ?? []));
    parameters.NextToken = nextParameters.NextToken;
  }
  logger.info(`Found #${parameters.Parameters?.length} parameters in path ${options.tokenPath}`);

  const minimumDate = new Date();
  minimumDate.setDate(minimumDate.getDate() - options.minimumDaysOld);

  for (const parameter of parameters.Parameters ?? []) {
    if (parameter.LastModifiedDate && new Date(parameter.LastModifiedDate) < minimumDate) {
      logger.info(`Deleting parameter ${parameter.Name} with last modified date ${parameter.LastModifiedDate}`);
      try {
        if (!options.dryRun) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          await client.send(new DeleteParameterCommand({ Name: parameter.Name }));
        }
      } catch (error) {
        logger.warn(`Failed to delete parameter ${parameter.Name} with error ${(error as Error).message}`);
        logger.debug('Failed to delete parameter', { error });
      }
    } else {
      logger.debug(`Skipping parameter ${parameter.Name} with last modified date ${parameter.LastModifiedDate}`);
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
