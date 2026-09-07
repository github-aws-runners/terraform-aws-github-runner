import { getParameters } from '@aws-github-runner/aws-ssm-util';

import type { GitHubAppCredential, GitHubAppCredentialsStore } from '../../core';
import { createAwsSsmStorageLogger, getErrorNames } from './logger';

const logger = createAwsSsmStorageLogger('github-app-credentials-store');

interface AwsSsmGitHubAppCredentialsEnvironment {
  PARAMETER_GITHUB_APP_ID_NAME?: string;
  PARAMETER_GITHUB_APP_KEY_BASE64_NAME?: string;
  PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME?: string;
}

export function createAwsSsmGitHubAppCredentialsStore(
  environment: Readonly<AwsSsmGitHubAppCredentialsEnvironment> = process.env,
): GitHubAppCredentialsStore {
  const idParameters = splitParameterNames(environment.PARAMETER_GITHUB_APP_ID_NAME, 'PARAMETER_GITHUB_APP_ID_NAME');
  const keyParameters = splitParameterNames(
    environment.PARAMETER_GITHUB_APP_KEY_BASE64_NAME,
    'PARAMETER_GITHUB_APP_KEY_BASE64_NAME',
  );
  const installationIdParameters = environment.PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME?.split(':') ?? [];

  if (idParameters.length !== keyParameters.length) {
    throw new Error(`GitHub App parameter count mismatch: ${idParameters.length} IDs vs ${keyParameters.length} keys`);
  }

  return new AwsSsmGitHubAppCredentialsStore(idParameters, keyParameters, installationIdParameters);
}

class AwsSsmGitHubAppCredentialsStore implements GitHubAppCredentialsStore {
  constructor(
    private readonly idParameters: string[],
    private readonly keyParameters: string[],
    private readonly installationIdParameters: string[],
  ) {}

  async get(): Promise<GitHubAppCredential[]> {
    const parameterNames = [
      ...this.idParameters,
      ...this.keyParameters,
      ...this.installationIdParameters.filter(Boolean),
    ];
    logger.debug('Reading GitHub App credential parameters', {
      parameterCount: parameterNames.length,
      appCount: this.idParameters.length,
    });

    let parameters: Map<string, string>;
    try {
      parameters = await getParameters(parameterNames);
    } catch (error) {
      logger.error('Failed to read GitHub App credential parameters', {
        parameterCount: parameterNames.length,
        appCount: this.idParameters.length,
        errorNames: getErrorNames(error),
      });
      throw error;
    }

    const credentials = this.idParameters.map((idParameter, index) => {
      const appIdValue = parameters.get(idParameter);
      if (!appIdValue) {
        logger.error('GitHub App credential parameter is missing', {
          credentialField: 'appId',
          appIndex: index,
          parameterName: idParameter,
        });
        throw new Error(`Parameter ${idParameter} not found`);
      }
      const keyParameter = this.keyParameters[index];
      const privateKeyBase64 = parameters.get(keyParameter);
      if (!privateKeyBase64) {
        logger.error('GitHub App credential parameter is missing', {
          credentialField: 'privateKey',
          appIndex: index,
          parameterName: keyParameter,
        });
        throw new Error(`Parameter ${keyParameter} not found`);
      }
      const installationIdParameter = this.installationIdParameters[index];
      const installationIdValue = installationIdParameter ? parameters.get(installationIdParameter) : undefined;
      return {
        appId: Number.parseInt(appIdValue, 10),
        privateKey: Buffer.from(privateKeyBase64, 'base64').toString().replace(/\\n/g, '\n'),
        installationId: installationIdValue ? Number.parseInt(installationIdValue, 10) : undefined,
      };
    });

    logger.debug('Loaded GitHub App credential parameters', {
      appCount: credentials.length,
      installationIdCount: credentials.filter(({ installationId }) => installationId !== undefined).length,
    });
    return credentials;
  }
}

function splitParameterNames(value: string | undefined, name: string): string[] {
  if (!value || value.trim() === '') {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value.split(':').filter(Boolean);
}
