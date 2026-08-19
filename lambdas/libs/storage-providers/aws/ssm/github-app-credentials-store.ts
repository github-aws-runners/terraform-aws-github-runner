import { getParameters } from '@aws-github-runner/aws-ssm-util';

import type { GitHubAppCredential, GitHubAppCredentialsStore } from '../../core';
import type {} from './environment';

export function createAwsSsmGitHubAppCredentialsStore(): GitHubAppCredentialsStore {
  return new AwsSsmGitHubAppCredentialsStore();
}

class AwsSsmGitHubAppCredentialsStore implements GitHubAppCredentialsStore {
  async get(): Promise<GitHubAppCredential[]> {
    if (!process.env.PARAMETER_GITHUB_APP_ID_NAME) {
      throw new Error('Environment variable PARAMETER_GITHUB_APP_ID_NAME is not set');
    }
    if (!process.env.PARAMETER_GITHUB_APP_KEY_BASE64_NAME) {
      throw new Error('Environment variable PARAMETER_GITHUB_APP_KEY_BASE64_NAME is not set');
    }

    const idParameters = process.env.PARAMETER_GITHUB_APP_ID_NAME.split(':').filter(Boolean);
    const keyParameters = process.env.PARAMETER_GITHUB_APP_KEY_BASE64_NAME.split(':').filter(Boolean);
    const installationIdParameters = (process.env.PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME || '').split(':');
    if (idParameters.length !== keyParameters.length) {
      throw new Error(
        `GitHub App parameter count mismatch: ${idParameters.length} IDs vs ${keyParameters.length} keys`,
      );
    }

    const parameterNames = [
      ...idParameters,
      ...keyParameters,
      ...installationIdParameters.filter((parameter) => parameter.length > 0),
    ];
    const parameters = await getParameters(parameterNames);

    const credentials: GitHubAppCredential[] = [];
    for (let index = 0; index < idParameters.length; index++) {
      const appIdValue = parameters.get(idParameters[index]);
      if (!appIdValue) {
        throw new Error(`Parameter ${idParameters[index]} not found`);
      }

      const privateKeyBase64 = parameters.get(keyParameters[index]);
      if (!privateKeyBase64) {
        throw new Error(`Parameter ${keyParameters[index]} not found`);
      }

      const installationIdParameter = installationIdParameters[index];
      const installationIdValue = installationIdParameter ? parameters.get(installationIdParameter) : undefined;

      credentials.push({
        appId: parseInt(appIdValue, 10),
        // Match the GitHub Terraform provider's handling of keys stored as a
        // single-line base64 value containing literal newline escapes.
        privateKey: Buffer.from(privateKeyBase64, 'base64').toString().replace(/\\n/g, '\n'),
        installationId: installationIdValue ? parseInt(installationIdValue, 10) : undefined,
      });
    }

    return credentials;
  }
}
