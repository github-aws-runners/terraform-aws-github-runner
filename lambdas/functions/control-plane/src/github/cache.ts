import type { InstallationAccessTokenAuthentication } from '@octokit/auth-app';
import type { GithubAppConfig } from './types';

const installationAuthObjects = new Map<string, InstallationAccessTokenAuthentication>();
const authConfigs = new Map<string, GithubAppConfig>();

export function createAuthCacheKey(type: 'app' | 'installation', installationId?: number, ghesApiUrl: string = '') {
  const id = installationId ?? 'none';
  return `${type}-auth-${id}-${ghesApiUrl}`;
}

export function createAuthConfigCacheKey(ghesApiUrl: string = '') {
  return `auth-config-${ghesApiUrl}`;
}

export async function getInstallationAuthObject(
  key: string,
  creator: () => Promise<InstallationAccessTokenAuthentication>,
): Promise<InstallationAccessTokenAuthentication> {
  if (installationAuthObjects.has(key)) {
    return installationAuthObjects.get(key)!;
  }

  const authObj = await creator();
  installationAuthObjects.set(key, authObj);
  return authObj;
}

export async function getAuthConfig(key: string, creator: () => Promise<GithubAppConfig>) {
  if (authConfigs.has(key)) {
    return authConfigs.get(key)!;
  }

  const config = await creator();
  authConfigs.set(key, config);
  return config;
}

export function reset() {
  installationAuthObjects.clear();
  authConfigs.clear();
}
