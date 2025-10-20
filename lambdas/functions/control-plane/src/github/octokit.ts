import { Octokit } from '@octokit/rest';
import { ActionRequestMessage } from '../scale-runners/scale-up';
import { createGithubAppAuth, createGithubInstallationAuth, createOctokitClient } from './auth';
import { getParameter } from '@aws-github-runner/aws-ssm-util';

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
  enableEnterpriseLevel: boolean,
  enableOrgLevel: boolean,
  payload: ActionRequestMessage,
): Promise<Octokit> {
  let ghToken;
  if (enableEnterpriseLevel) {
    ghToken = await getParameter(process.env.PARAMETER_ENTERPRISE_PAT_NAME);
  } else {
    const installationId = await getInstallationId(ghesApiUrl, enableOrgLevel, payload);
    ghToken = (await createGithubInstallationAuth(installationId, ghesApiUrl)).token;
  }

  return await createOctokitClient(ghToken, ghesApiUrl);
}
