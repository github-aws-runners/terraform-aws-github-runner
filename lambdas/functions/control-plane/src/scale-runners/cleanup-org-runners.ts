import { Octokit } from '@octokit/rest';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { createGithubAppAuth, createGithubInstallationAuth, createOctokitClient } from '../github/auth';
import { getGitHubEnterpriseApiUrl } from './scale-up';

export const logger = createChildLogger('cleanup-runners');

type UnboxPromise<T> = T extends Promise<infer U> ? U : T;
type GhRunners = UnboxPromise<ReturnType<Octokit['actions']['listSelfHostedRunnersForRepo']>>['data']['runners'];

async function listGitHubRunners(ghClient: Octokit, runnerOwner: string): Promise<GhRunners> {
  const runners = await ghClient.paginate(ghClient.actions.listSelfHostedRunnersForOrg, {
    org: runnerOwner,
    per_page: 100,
  });
  return runners;
}

async function deleteOfflineRunners(ghClient: Octokit, runnerOwner: string, runnerLabels: string[]): Promise<void> {
  const ghRunners = await listGitHubRunners(ghClient, runnerOwner);
  await Promise.all(
    ghRunners.map(async (ghRunner) => {
      if (ghRunner.status !== 'offline') return null;
      if (runnerLabels.length > 0 && !ghRunner.labels.every((label) => runnerLabels.includes(label.name))) return null;
      logger.info(`Deleting runner ${ghRunner.name} with id ${ghRunner.id}`);
      return (
        await ghClient.actions.deleteSelfHostedRunnerFromOrg({
          runner_id: ghRunner.id,
          org: runnerOwner,
        })
      ).status;
    }),
  );
}

export async function cleanupOrgRunners(): Promise<void> {
  const runnerOwner = process.env.RUNNER_OWNER;
  const runnerLabels = process.env.RUNNER_LABELS ? process.env.RUNNER_LABELS.split(',') : [];

  const { ghesApiUrl } = getGitHubEnterpriseApiUrl();
  const ghAuthPre = await createGithubAppAuth(undefined, ghesApiUrl);
  const githubClientPre = await createOctokitClient(ghAuthPre.token, ghesApiUrl);

  const installationId = (await githubClientPre.apps.getOrgInstallation({ org: runnerOwner })).data.id;
  const ghAuth = await createGithubInstallationAuth(installationId, ghesApiUrl);
  const octokit = await createOctokitClient(ghAuth.token, ghesApiUrl);

  await deleteOfflineRunners(octokit, runnerOwner, runnerLabels);
}
