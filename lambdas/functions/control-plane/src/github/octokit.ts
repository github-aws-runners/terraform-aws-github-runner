import { Octokit } from '@octokit/rest';
import { ActionRequestMessage } from '../scale-runners/scale-up';
import {
  createGithubAppAuth,
  createGithubInstallationAuth,
  createOctokitClient,
  getAppCount,
  getStoredInstallationId,
} from './auth';

export async function getInstallationId(
  ghesApiUrl: string,
  enableOrgLevel: boolean,
  payload: ActionRequestMessage,
  appIndex?: number,
): Promise<number> {
  // Use pre-stored installation ID when available (avoids an API call)
  if (appIndex !== undefined) {
    const storedId = await getStoredInstallationId(appIndex);
    if (storedId !== undefined) return storedId;
  }

  const multiApp = (await getAppCount()) > 1;

  if (!multiApp && payload.installationId !== 0) {
    return payload.installationId;
  }

  const ghAuth = await createGithubAppAuth(undefined, ghesApiUrl, appIndex);
  const githubClient = await createOctokitClient(ghAuth.token, ghesApiUrl);
  return enableOrgLevel
    ? (
        await githubClient.apps.getOrgInstallation({
          org: payload.repositoryOwner,
        })
      ).data.id
    : (
        await githubClient.apps.getRepoInstallation({
          owner: payload.repositoryOwner,
          repo: payload.repositoryName,
        })
      ).data.id;
}

/**
 *
 * Util method to get an octokit client based on provided installation id. This method should
 * phase out the usages of methods in gh-auth.ts outside of this module. Main purpose to make
 * mocking of the octokit client easier.
 *
 * @returns ockokit client
 */
export async function getOctokit(
  ghesApiUrl: string,
  enableOrgLevel: boolean,
  payload: ActionRequestMessage,
): Promise<Octokit> {
  // Select one app for this entire auth flow
  const ghAuth = await createGithubAppAuth(undefined, ghesApiUrl);
  const appIdx = ghAuth.appIndex;

  const installationId = await getInstallationId(ghesApiUrl, enableOrgLevel, payload, appIdx);
  const installationAuth = await createGithubInstallationAuth(installationId, ghesApiUrl, appIdx);
  return await createOctokitClient(installationAuth.token, ghesApiUrl);
}
