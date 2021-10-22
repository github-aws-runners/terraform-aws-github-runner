import { Octokit } from '@octokit/rest';
import { request } from '@octokit/request';
import { createAppAuth } from '@octokit/auth-app';
import {
  StrategyOptions,
  AppAuthentication,
  AppAuthOptions,
  InstallationAuthOptions,
  InstallationAccessTokenAuthentication,
  AuthInterface,
} from '@octokit/auth-app/dist-types/types';
import { OctokitOptions } from '@octokit/core/dist-types/types';
import { getParameterValue } from './ssm';
import { logger as rootLogger } from './logger';

const logger = rootLogger.getChildLogger();

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
  return await auth(appAuthOptions);
}

export async function createGithubInstallationAuth(
  installationId: number | undefined,
  ghesApiUrl = '',
): Promise<InstallationAccessTokenAuthentication> {
  const auth = await createAuth(installationId, ghesApiUrl);
  const installationAuthOptions: InstallationAuthOptions = { type: 'installation', installationId };
  return await auth(installationAuthOptions);
}

async function createAuth(installationId: number | undefined, ghesApiUrl: string): Promise<AuthInterface> {
  const appId = parseInt(await getParameterValue(process.env.PARAMETER_GITHUB_APP_ID_NAME));
  let authOptions: StrategyOptions = {
    appId,
    privateKey: Buffer.from(
      await getParameterValue(process.env.PARAMETER_GITHUB_APP_KEY_BASE64_NAME),
      'base64',
    ).toString(),
  };
  if (installationId) authOptions = { ...authOptions, installationId };

  logger.debug(`GHES API URL: ${ghesApiUrl}`);
  if (ghesApiUrl) {
    authOptions.request = request.defaults({
      baseUrl: ghesApiUrl,
    });
  }
  return createAppAuth(authOptions);
}
