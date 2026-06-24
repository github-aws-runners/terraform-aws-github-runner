import { Octokit } from '@octokit/rest';
import { ActionRequestMessage } from '../scale-runners/scale-up';
import { createGithubAppAuth, createGithubInstallationAuth, createOctokitClient } from './auth';

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const errorWithStatus = error as { status?: number; response?: { status?: number } };
  return errorWithStatus.status ?? errorWithStatus.response?.status;
}

async function resolveInstallationId(
  githubClient: Octokit,
  enableOrgLevel: boolean,
  payload: ActionRequestMessage,
): Promise<number> {
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

export async function getInstallationId(
  ghesApiUrl: string,
  enableOrgLevel: boolean,
  payload: ActionRequestMessage,
): Promise<number> {
  if (payload.installationId !== 0) {
    return payload.installationId;
  }

  const ghAuth = await createGithubAppAuth(undefined, ghesApiUrl);
  const githubClient = await createOctokitClient(ghAuth.token, ghesApiUrl);
  return resolveInstallationId(githubClient, enableOrgLevel, payload);
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
  let githubAppClient: Octokit | undefined;
  let installationId = payload.installationId !== 0 ? payload.installationId : undefined;

  const getGithubAppClient = async (): Promise<Octokit> => {
    if (githubAppClient === undefined) {
      const appAuth = await createGithubAppAuth(undefined, ghesApiUrl);
      githubAppClient = await createOctokitClient(appAuth.token, ghesApiUrl);
    }

    return githubAppClient;
  };

  try {
    if (installationId === undefined) {
      installationId = await resolveInstallationId(await getGithubAppClient(), enableOrgLevel, payload);
    }

    const ghAuth = await createGithubInstallationAuth(installationId, ghesApiUrl);
    return await createOctokitClient(ghAuth.token, ghesApiUrl);
  } catch (error) {
    if (payload.installationId === 0 || getErrorStatus(error) !== 404) {
      throw error;
    }

    const resolvedInstallationId = await resolveInstallationId(await getGithubAppClient(), enableOrgLevel, payload);
    if (resolvedInstallationId === payload.installationId) {
      throw error;
    }

    const ghAuth = await createGithubInstallationAuth(resolvedInstallationId, ghesApiUrl);
    return await createOctokitClient(ghAuth.token, ghesApiUrl);
  }
}
