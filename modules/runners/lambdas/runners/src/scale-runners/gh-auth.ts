import { Octokit } from '@octokit/rest';
import { request } from '@octokit/request';
import { createAppAuth } from '@octokit/auth-app';
import { Authentication, StrategyOptions } from '@octokit/auth-app/dist-types/types';
import { OctokitOptions } from '@octokit/core/dist-types/types';
import { decrypt } from './kms';

export async function createOctoClient(token: string, ghesApiUrl: string = ''): Promise<Octokit> {
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
  ghesApiUrl: string = '',
): Promise<Authentication> {
  const clientSecret = await decrypt(
    process.env.GITHUB_APP_CLIENT_SECRET as string,
    process.env.KMS_KEY_ID as string,
    process.env.ENVIRONMENT as string,
  );
  const privateKeyBase64 = await decrypt(
    process.env.GITHUB_APP_KEY_BASE64 as string,
    process.env.KMS_KEY_ID as string,
    process.env.ENVIRONMENT as string,
  );

  if (clientSecret === undefined || privateKeyBase64 === undefined) {
    throw Error('Cannot decrypt.');
  }

  const privateKey = Buffer.from(privateKeyBase64, 'base64').toString();

  const appId: number = parseInt(process.env.GITHUB_APP_ID as string);
  const clientId = process.env.GITHUB_APP_CLIENT_ID as string;

  const authOptions: StrategyOptions = {
    appId,
    privateKey,
    installationId,
    clientId,
    clientSecret,
  };
  console.debug(ghesApiUrl);
  if (ghesApiUrl) {
    authOptions.request = request.defaults({
      baseUrl: ghesApiUrl,
    });
  }
  return await createAppAuth(authOptions)({ type: authType });
}
