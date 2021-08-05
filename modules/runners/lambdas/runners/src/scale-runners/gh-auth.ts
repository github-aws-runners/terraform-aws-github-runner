import { Octokit } from '@octokit/rest';
import { request } from '@octokit/request';
import { createAppAuth } from '@octokit/auth-app';
import { StrategyOptions, AppAuthentication } from '@octokit/auth-app/dist-types/types';
import { OctokitOptions } from '@octokit/core/dist-types/types';
import { getParameterValue } from './ssm';

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

export async function createGithubAuth(
  installationId: number | undefined,
  authType: 'app' | 'installation',
  ghesApiUrl = '',
): Promise<AppAuthentication> {
  let authOptions: StrategyOptions = {
    appId: parseInt(await getParameterValue(process.env.PARAMETER_GITHUB_APP_ID_NAME)),
    privateKey: Buffer.from(
      await getParameterValue(process.env.PARAMETER_GITHUB_APP_KEY_BASE64_NAME),
      'base64',
    ).toString(),
    clientId: await getParameterValue(process.env.PARAMETER_GITHUB_APP_CLIENT_ID_NAME),
    clientSecret: await getParameterValue(process.env.PARAMETER_GITHUB_APP_CLIENT_SECRET_NAME),
  };
  if (installationId) authOptions = { ...authOptions, installationId };

  console.debug(ghesApiUrl);
  if (ghesApiUrl) {
    authOptions.request = request.defaults({
      baseUrl: ghesApiUrl,
    });
  }
  const result = (await createAppAuth(authOptions)({ type: authType })) as AppAuthentication;
  return result;
}
