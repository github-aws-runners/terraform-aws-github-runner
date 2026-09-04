import { getParameters } from '@aws-github-runner/aws-ssm-util';

import type { GitHubAppCredential, GitHubAppCredentialsStore } from '../../core';

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
  const installationIdParameters = environment.PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME?.split(':').filter(Boolean) ?? [];

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
    const parameters = await getParameters([
      ...this.idParameters,
      ...this.keyParameters,
      ...this.installationIdParameters,
    ]);
    return this.idParameters.map((idParameter, index) => {
      const appIdValue = parameters.get(idParameter);
      if (!appIdValue) {
        throw new Error(`Parameter ${idParameter} not found`);
      }
      const privateKeyBase64 = parameters.get(this.keyParameters[index]);
      if (!privateKeyBase64) {
        throw new Error(`Parameter ${this.keyParameters[index]} not found`);
      }
      const installationIdParameter = this.installationIdParameters[index];
      const installationIdValue = installationIdParameter ? parameters.get(installationIdParameter) : undefined;
      return {
        appId: Number.parseInt(appIdValue, 10),
        privateKey: Buffer.from(privateKeyBase64, 'base64').toString().replace(/\\n/g, '\n'),
        installationId: installationIdValue ? Number.parseInt(installationIdValue, 10) : undefined,
      };
    });
  }
}

function splitParameterNames(value: string | undefined, name: string): string[] {
  if (!value || value.trim() === '') {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value.split(':').filter(Boolean);
}
