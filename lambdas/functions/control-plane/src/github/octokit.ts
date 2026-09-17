import { Octokit } from '@octokit/rest';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import type { ActionRequestMessage } from '../scale-runners/types';
import {
  createGithubAppAuth,
  createGithubInstallationAuth,
  createOctokitClient,
  getStoredInstallationId,
} from './auth';

const logger = createChildLogger('octokit');

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const errorWithStatus = error as { status?: number; response?: { status?: number } };
  return errorWithStatus.status ?? errorWithStatus.response?.status;
}

async function resolveInstallationIdFromApi(
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

async function resolveInstallationId(
  githubClient: Octokit,
  enableOrgLevel: boolean,
  payload: ActionRequestMessage,
  appIndex?: number,
): Promise<number> {
  // Use pre-stored installation ID when available (avoids an API call)
  if (appIndex !== undefined) {
    const storedId = await getStoredInstallationId(appIndex);
    if (storedId !== undefined) return storedId;
  }

  // The primary app (index 0, or the single-app case where appIndex is undefined) can reuse
  // the installation id carried on the webhook payload, since the webhook is delivered by the
  // primary app. Additional apps must resolve their own installation id via the API.
  const isPrimaryApp = appIndex === undefined || appIndex === 0;
  if (isPrimaryApp && payload.installationId !== 0) {
    return payload.installationId;
  }

  return resolveInstallationIdFromApi(githubClient, enableOrgLevel, payload);
}

export async function getInstallationId(
  ghesApiUrl: string,
  enableOrgLevel: boolean,
  payload: ActionRequestMessage,
  appIndex?: number,
): Promise<number> {
  const ghAuth = await createGithubAppAuth(undefined, ghesApiUrl, appIndex);
  const githubClient = await createOctokitClient(ghAuth.token, ghesApiUrl);
  return resolveInstallationId(githubClient, enableOrgLevel, payload, appIndex);
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
  const githubAppClient = await createOctokitClient(ghAuth.token, ghesApiUrl);

  const installationId = await resolveInstallationId(githubAppClient, enableOrgLevel, payload, appIdx);

  try {
    const installationAuth = await createGithubInstallationAuth(installationId, ghesApiUrl, appIdx);
    return await createOctokitClient(installationAuth.token, ghesApiUrl);
  } catch (error) {
    // The installation id can be stale when it was reused from the webhook payload or from the
    // pre-configured per-app value while the app was uninstalled and reinstalled. Re-resolve the
    // installation via the API once and retry with the same app before giving up.
    if (getErrorStatus(error) !== 404) {
      throw error;
    }

    const resolvedInstallationId = await resolveInstallationIdFromApi(githubAppClient, enableOrgLevel, payload);
    if (resolvedInstallationId === installationId) {
      throw error;
    }

    logger.warn('Retrying GitHub installation auth with installation resolved for the selected app', {
      staleInstallationId: installationId,
      resolvedInstallationId,
      appIndex: appIdx,
      repositoryOwner: payload.repositoryOwner,
      repositoryName: payload.repositoryName,
    });

    const installationAuth = await createGithubInstallationAuth(resolvedInstallationId, ghesApiUrl, appIdx);
    return await createOctokitClient(installationAuth.token, ghesApiUrl);
  }
}
