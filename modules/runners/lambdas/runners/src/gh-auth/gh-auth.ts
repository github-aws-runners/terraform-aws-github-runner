import { createAppAuth } from '@octokit/auth-app';
import {
  AppAuthOptions,
  AppAuthentication,
  AuthInterface,
  InstallationAccessTokenAuthentication,
  InstallationAuthOptions,
  StrategyOptions,
} from '@octokit/auth-app/dist-types/types';
import { OctokitOptions } from '@octokit/core/dist-types/types';
import { request } from '@octokit/request';
import { Octokit } from '@octokit/rest';

import { getParameterValue } from '../aws/ssm';
import { LogFields, logger as rootLogger } from '../logger';

const logger = rootLogger.getChildLogger({ name: 'gh-auth' });

export async function createOctoClient(token: string, ghesApiUrl = ''): Promise<Octokit> {
  const ocktokitOptions: OctokitOptions = {
    auth: token,
  };
  if (ghesApiUrl) {
    ocktokitOptions.baseUrl = ghesApiUrl;
    ocktokitOptions.previews = ['antiope'];
  }
  return new Octokit(ocktokitOptions);
}

export async function createGithubAppAuth(
  installationId: number | undefined,
  ghesApiUrl = '',
): Promise<AppAuthentication> {
  const auth = await createAuth(installationId, ghesApiUrl);
  const appAuthOptions: AppAuthOptions = { type: 'app' };
  return auth(appAuthOptions);
}

export async function createGithubInstallationAuth(
  installationId: number | undefined,
  ghesApiUrl = '',
): Promise<InstallationAccessTokenAuthentication> {
  const auth = await createAuth(installationId, ghesApiUrl);
  const installationAuthOptions: InstallationAuthOptions = { type: 'installation', installationId };
  return auth(installationAuthOptions);
}

async function createAuth(installationId: number | undefined, ghesApiUrl: string): Promise<AuthInterface> {
  const appId = parseInt(await getParameterValue(process.env.PARAMETER_GITHUB_APP_ID_NAME));
  let authOptions: StrategyOptions = {
    appId,
    privateKey: Buffer.from(
      await getParameterValue(process.env.PARAMETER_GITHUB_APP_KEY_BASE64_NAME),
      'base64',
      // replace literal \n characters with new lines to allow the key to be stored as a
      // single line variable. This logic should match how the GitHub Terraform provider
      // processes private keys to retain compatibility between the projects
    )
      .toString()
      .replace('/[\\n]/g', String.fromCharCode(10)),
  };
  if (installationId) authOptions = { ...authOptions, installationId };

  logger.debug(`GHES API URL: ${ghesApiUrl}`, LogFields.print());
  if (ghesApiUrl) {
    authOptions.request = request.defaults({
      baseUrl: ghesApiUrl,
    });
  }
  return createAppAuth(authOptions);
}
