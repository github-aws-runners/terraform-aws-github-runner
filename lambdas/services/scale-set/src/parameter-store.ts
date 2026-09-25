import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';

import { getParameters } from '@aws-github-runner/aws-ssm-util';

import {
  MAX_MANIFEST_BYTES,
  SCALE_SET_CONTROLLER_MANIFEST_VERSION,
  ScaleSetConfigurationError,
  parseScaleSetControllerManifest,
  parseScaleSetReconcilerConfig,
  validateUniqueReconcilers,
  type ScaleSetControllerManifest,
  type ScaleSetServiceConfig,
} from './config';
import type { ParameterStore } from './credentials';

const MAX_GROUP_PARAMETERS = 1000;
const MAX_PARAMETER_BYTES = 64 * 1024;
const MAX_GROUP_BYTES = 4 * 1024 * 1024;

export const defaultParameterStore: ParameterStore = {
  get: async (names) => await getParameters([...names]),
};

export interface ControllerManifestLoader {
  load(config: ScaleSetServiceConfig): Promise<ScaleSetControllerManifest>;
}

export interface ParametersByPathClient {
  send(command: GetParametersByPathCommand): Promise<{
    Parameters?: Array<{ Name?: string; Value?: string }>;
    NextToken?: string;
  }>;
}

export function createControllerManifestLoader(client: ParametersByPathClient): ControllerManifestLoader {
  return {
    load: async (config) => {
      if (config.manifest !== undefined) return parseScaleSetControllerManifest(config.manifest);
      if (!config.groupConfigPath || !config.groupName || !config.groupRevision) {
        throw new ScaleSetConfigurationError('SSM group configuration source is incomplete');
      }
      const prefix = `${config.groupConfigPath.replace(/\/$/, '')}/`;
      const parameters: Array<{ name: string; value: string }> = [];
      const seenTokens = new Set<string>();
      let nextToken: string | undefined;
      let totalBytes = 0;
      do {
        if (nextToken !== undefined && seenTokens.has(nextToken)) {
          throw new ScaleSetConfigurationError('SSM pagination returned a repeated token');
        }
        if (nextToken !== undefined) seenTokens.add(nextToken);
        const response = await client.send(
          new GetParametersByPathCommand({
            Path: config.groupConfigPath,
            Recursive: false,
            WithDecryption: false,
            MaxResults: 10,
            ...(nextToken === undefined ? {} : { NextToken: nextToken }),
          }),
        );
        for (const parameter of response.Parameters ?? []) {
          if (!parameter.Name || parameter.Value === undefined) {
            throw new ScaleSetConfigurationError('SSM group configuration returned an incomplete parameter');
          }
          if (!parameter.Name.startsWith(prefix) || parameter.Name.slice(prefix.length).includes('/')) {
            throw new ScaleSetConfigurationError(
              'SSM group configuration returned a parameter outside the direct group path',
            );
          }
          const size = Buffer.byteLength(parameter.Value, 'utf8');
          if (size > MAX_PARAMETER_BYTES || size > MAX_MANIFEST_BYTES) {
            throw new ScaleSetConfigurationError(
              `runner config parameter ${JSON.stringify(parameter.Name)} is too large`,
            );
          }
          totalBytes += size;
          if (totalBytes > MAX_GROUP_BYTES)
            throw new ScaleSetConfigurationError('SSM controller group configuration is too large');
          parameters.push({ name: parameter.Name, value: parameter.Value });
          if (parameters.length > MAX_GROUP_PARAMETERS) {
            throw new ScaleSetConfigurationError(`SSM controller group exceeds ${MAX_GROUP_PARAMETERS} runner configs`);
          }
        }
        nextToken = response.NextToken;
      } while (nextToken !== undefined);

      if (parameters.length === 0)
        throw new ScaleSetConfigurationError('SSM controller group contains no runner configs');
      parameters.sort((left, right) => left.name.localeCompare(right.name));
      const reconcilers = parameters.map(({ name, value }, index) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(value) as unknown;
        } catch (error) {
          throw new ScaleSetConfigurationError(
            `runner config parameter ${JSON.stringify(name)} contains invalid JSON`,
            {
              cause: error,
            },
          );
        }
        const reconciler = parseScaleSetReconcilerConfig(parsed, index, config.groupName as string, 'ssmRunnerConfigs');
        const leafName = name.slice(prefix.length);
        if (leafName !== reconciler.runnerConfigName) {
          throw new ScaleSetConfigurationError(
            `runner config parameter ${JSON.stringify(name)} must match runnerConfigName ${JSON.stringify(reconciler.runnerConfigName)}`,
          );
        }
        return reconciler;
      });
      validateUniqueReconcilers(reconcilers);
      return {
        version: SCALE_SET_CONTROLLER_MANIFEST_VERSION,
        groupName: config.groupName,
        revision: config.groupRevision,
        reconcilers,
      };
    },
  };
}

export function createDefaultControllerManifestLoader(): ControllerManifestLoader {
  return createControllerManifestLoader(
    new SSMClient({
      region: process.env.AWS_REGION,
      maxAttempts: 10,
      retryMode: 'adaptive',
    }),
  );
}
