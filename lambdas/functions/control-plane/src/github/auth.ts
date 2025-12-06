import { createAppAuth, type AppAuthentication, type InstallationAccessTokenAuthentication } from '@octokit/auth-app';
import type { OctokitOptions } from '@octokit/core';
import type { RequestInterface } from '@octokit/types';

// Define types that are not directly exported
type AppAuthOptions = { type: 'app' };
type InstallationAuthOptions = { type: 'installation'; installationId?: number };
// Use a more generalized AuthInterface to match what createAppAuth returns
type AuthInterface = {
  (options: AppAuthOptions): Promise<AppAuthentication>;
  (options: InstallationAuthOptions): Promise<InstallationAccessTokenAuthentication>;
};
type StrategyOptions = {
  appId: number;
  privateKey: string;
  installationId?: number;
  request?: RequestInterface;
};
import { request } from '@octokit/request';
import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { getParameter } from '@aws-github-runner/aws-ssm-util';
import { EndpointDefaults } from '@octokit/types';
import { getInstallationAuthObject, getAuthConfig, createAuthCacheKey, createAuthConfigCacheKey } from './cache';
import type { GithubAppConfig } from './types';

const logger = createChildLogger('gh-auth');

export async function createOctokitClient(token: string, ghesApiUrl = ''): Promise<Octokit> {
  const CustomOctokit = Octokit.plugin(throttling);
  const ocktokitOptions: OctokitOptions = {
    auth: token,
  };
  if (ghesApiUrl) {
    ocktokitOptions.baseUrl = ghesApiUrl;
    ocktokitOptions.previews = ['antiope'];
  }

  return new CustomOctokit({
    ...ocktokitOptions,
    userAgent: process.env.USER_AGENT || 'github-aws-runners',
    throttle: {
      onRateLimit: (retryAfter: number, options: Required<EndpointDefaults>) => {
        logger.warn(
          `GitHub rate limit: Request quota exhausted for request ${options.method} ${options.url}. Requested `,
        );
      },
      onSecondaryRateLimit: (retryAfter: number, options: Required<EndpointDefaults>) => {
        logger.warn(`GitHub rate limit: SecondaryRateLimit detected for request ${options.method} ${options.url}`);
      },
    },
  });
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
  const cacheKey = createAuthCacheKey('installation', installationId, ghesApiUrl);

  return getInstallationAuthObject(cacheKey, async () => {
    const auth = await createAuth(installationId, ghesApiUrl);
    const installationAuthOptions: InstallationAuthOptions = { type: 'installation', installationId };
    return auth(installationAuthOptions);
  });
}

async function createAuth(installationId: number | undefined, ghesApiUrl: string): Promise<AuthInterface> {
  const configCacheKey = createAuthConfigCacheKey(ghesApiUrl);

  const config = await getAuthConfig(configCacheKey, async (): Promise<GithubAppConfig> => {
    const appId = parseInt(await getParameter(process.env.PARAMETER_GITHUB_APP_ID_NAME));
    const privateKey = Buffer.from(
      await getParameter(process.env.PARAMETER_GITHUB_APP_KEY_BASE64_NAME),
      'base64',
      // replace literal \n characters with new lines to allow the key to be stored as a
      // single line variable. This logic should match how the GitHub Terraform provider
      // processes private keys to retain compatibility between the projects
    )
      .toString()
      .replace(/\\n/g, String.fromCharCode(10));

    return {
      appId,
      privateKey,
    };
  });

  let authOptions: StrategyOptions = {
    appId: config.appId,
    privateKey: config.privateKey,
  };
  if (installationId) authOptions = { ...authOptions, installationId };

  logger.debug(`GHES API URL: ${ghesApiUrl}`);
  if (ghesApiUrl) {
    authOptions.request = request.defaults({
      baseUrl: ghesApiUrl,
    }) as RequestInterface;
  }
  return createAppAuth(authOptions);
}
