import { getParameter, getParameters } from '@aws-github-runner/aws-ssm-util';

import type { GitHubAppCredential, GitHubAppCredentialsStore } from '../../core';
import { createAwsSsmStorageLogger, getErrorNames } from './logger';

const logger = createAwsSsmStorageLogger('github-app-credentials-store');

interface AwsSsmGitHubAppCredentialsEnvironment {
  PARAMETER_GITHUB_APP_ID_NAME?: string;
  PARAMETER_GITHUB_APP_KEY_BASE64_NAME?: string;
  PARAMETER_GITHUB_APPS_MANIFEST_NAME?: string;
}

export function createAwsSsmGitHubAppCredentialsStore(
  environment: Readonly<AwsSsmGitHubAppCredentialsEnvironment> = process.env,
): GitHubAppCredentialsStore {
  const idParameter = requireParameterName(environment.PARAMETER_GITHUB_APP_ID_NAME, 'PARAMETER_GITHUB_APP_ID_NAME');
  const keyParameter = requireParameterName(
    environment.PARAMETER_GITHUB_APP_KEY_BASE64_NAME,
    'PARAMETER_GITHUB_APP_KEY_BASE64_NAME',
  );
  return new AwsSsmGitHubAppCredentialsStore(
    idParameter,
    keyParameter,
    environment.PARAMETER_GITHUB_APPS_MANIFEST_NAME,
  );
}

interface AdditionalAppManifestEntry {
  idParamName: string;
  keyParamName: string;
  installationIdParamName?: string | null;
}

class AwsSsmGitHubAppCredentialsStore implements GitHubAppCredentialsStore {
  constructor(
    private readonly idParameter: string,
    private readonly keyParameter: string,
    private readonly manifestParameter?: string,
  ) {}

  async get(): Promise<GitHubAppCredential[]> {
    const entries: AdditionalAppManifestEntry[] = [{ idParamName: this.idParameter, keyParamName: this.keyParameter }];
    if (this.manifestParameter) {
      const manifest = JSON.parse(await getParameter(this.manifestParameter)) as AdditionalAppManifestEntry[];
      entries.push(...manifest);
    }
    const idParameters = entries.map((entry) => entry.idParamName);
    const keyParameters = entries.map((entry) => entry.keyParamName);
    const installationIdParameters = entries.map((entry) => entry.installationIdParamName);

    const parameterNames = [
      ...idParameters,
      ...keyParameters,
      ...installationIdParameters.filter((name): name is string => Boolean(name)),
    ];
    logger.debug('Reading GitHub App credential parameters', {
      parameterCount: parameterNames.length,
      appCount: idParameters.length,
    });

    let parameters: Map<string, string>;
    try {
      parameters = await getParameters(parameterNames);
    } catch (error) {
      logger.error('Failed to read GitHub App credential parameters', {
        parameterCount: parameterNames.length,
        appCount: idParameters.length,
        errorNames: getErrorNames(error),
      });
      throw error;
    }

    const credentials = idParameters.map((idParameter, index) => {
      const appIdValue = parameters.get(idParameter);
      if (!appIdValue) {
        logger.error('GitHub App credential parameter is missing', {
          credentialField: 'appId',
          appIndex: index,
          parameterName: idParameter,
        });
        throw new Error(`Parameter ${idParameter} not found`);
      }
      const keyParameter = keyParameters[index];
      const privateKeyBase64 = parameters.get(keyParameter);
      if (!privateKeyBase64) {
        logger.error('GitHub App credential parameter is missing', {
          credentialField: 'privateKey',
          appIndex: index,
          parameterName: keyParameter,
        });
        throw new Error(`Parameter ${keyParameter} not found`);
      }
      const installationIdParameter = installationIdParameters[index];
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

function requireParameterName(value: string | undefined, name: string): string {
  if (!value || value.trim() === '') {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
}
