import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { resolveRunnerProviderType } from '@aws-github-runner/runner-provider';
import { Octokit } from '@octokit/rest';
import yn from 'yn';

import {
  createEnterprisePATClient,
  createGithubAppAuth,
  createGithubInstallationAuth,
  createOctokitClient,
} from '../github/auth';
import { createPoolRunnerProvider } from '../runner-provider-registry';
import { getGitHubEnterpriseApiUrl, validateSsmParameterStoreTags } from '../scale-runners/github-runner';
import { resolveRunnerType } from '../scale-runners/runner-config';
import type { GitHubRunnerType } from '../scale-runners/types';
import type { RunnerStatus } from './pool-provider';

const logger = createChildLogger('pool');

export interface PoolEvent {
  poolSize: number;
  type?: string;
}

export async function adjust(event: PoolEvent): Promise<void> {
  const runnerProviderType = resolveRunnerProviderType(event.type);
  const runnerProvider = createPoolRunnerProvider(runnerProviderType);
  logger.info(`Checking current ${runnerProvider.type} pool size against pool of size: ${event.poolSize}`);
  const runnerLabels = process.env.RUNNER_LABELS || '';
  const runnerGroup = process.env.RUNNER_GROUP_NAME || '';
  const runnerNamePrefix = process.env.RUNNER_NAME_PREFIX || '';
  const environment = process.env.ENVIRONMENT;
  const ssmTokenPath = process.env.SSM_TOKEN_PATH;
  const ssmConfigPath = process.env.SSM_CONFIG_PATH || '';
  const ephemeral = yn(process.env.ENABLE_EPHEMERAL_RUNNERS, { default: false });
  const enableJitConfig = yn(process.env.ENABLE_JIT_CONFIG, { default: ephemeral });
  const disableAutoUpdate = yn(process.env.DISABLE_RUNNER_AUTOUPDATE, { default: false });
  const runnerOwner = process.env.RUNNER_OWNER;
  const runnerType = resolveRunnerType();
  const enterpriseSlug = process.env.ENTERPRISE_SLUG;
  const ssmParameterStoreTags: { Key: string; Value: string }[] =
    process.env.SSM_PARAMETER_STORE_TAGS && process.env.SSM_PARAMETER_STORE_TAGS.trim() !== ''
      ? validateSsmParameterStoreTags(process.env.SSM_PARAMETER_STORE_TAGS)
      : [];
  const maximumRunners = parseInt(process.env.RUNNERS_MAXIMUM_COUNT || '-1');
  const includeBusyRunners = yn(process.env.INCLUDE_BUSY_RUNNERS, { default: false });
  const { ghesApiUrl, ghesBaseUrl } = getGitHubEnterpriseApiUrl();

  if (runnerType == 'Enterprise' && !enterpriseSlug) {
    throw new Error('ENTERPRISE_SLUG must be set when RUNNER_REGISTRATION_LEVEL is enterprise.');
  }
  if (!runnerOwner && runnerType !== 'Enterprise') {
    throw new Error('RUNNER_OWNER must be set for org and repo runner registration levels.');
  }

  const githubOwner = runnerType === 'Enterprise' ? enterpriseSlug! : runnerOwner!;

  let githubInstallationClient: Octokit;
  if (runnerType === 'Enterprise') {
    githubInstallationClient = await createEnterprisePATClient(ghesApiUrl);
  } else {
    const installationId = await getInstallationId(ghesApiUrl, githubOwner, runnerType);
    const ghAuth = await createGithubInstallationAuth(installationId, ghesApiUrl);
    githubInstallationClient = await createOctokitClient(ghAuth.token, ghesApiUrl);
  }

  const runnerStatuses = await getGitHubRegisteredRunnerStatuses(
    githubInstallationClient,
    githubOwner,
    runnerNamePrefix,
    runnerType,
  );

  const poolRunners = await runnerProvider.listRunners({
    environment,
    runnerOwner: githubOwner,
    runnerType,
  });

  const numberOfRunnersInPool = runnerProvider.countAvailableRunners(poolRunners, runnerStatuses, includeBusyRunners);
  let topUp = event.poolSize - numberOfRunnersInPool;

  if (maximumRunners !== -1 && topUp > 0) {
    const headroom = maximumRunners - poolRunners.length;
    if (topUp > headroom) {
      logger.info(
        `Capping pool top-up from ${topUp} to ${Math.max(headroom, 0)} to respect the maximum of ` +
          `${maximumRunners} runners (currently ${poolRunners.length} running).`,
      );
      topUp = headroom;
    }
  }

  if (topUp > 0) {
    logger.info(`The pool will be topped up with ${topUp} runners.`);
    await runnerProvider.createRunners({
      githubRunnerConfig: {
        ephemeral,
        enableJitConfig,
        ghesBaseUrl,
        runnerLabels,
        runnerGroup,
        runnerOwner: githubOwner,
        runnerNamePrefix,
        runnerType,
        enterpriseSlug,
        disableAutoUpdate,
        ssmTokenPath,
        ssmConfigPath,
        ssmParameterStoreTags,
      },
      numberOfRunners: topUp,
      githubInstallationClient,
    });
  } else {
    logger.info(`Pool will not be topped up. Found ${numberOfRunnersInPool} managed idle runners.`);
  }
}

async function getInstallationId(
  ghesApiUrl: string,
  runnerOwner: string,
  runnerType: Exclude<GitHubRunnerType, 'Enterprise'>,
): Promise<number> {
  const ghAuth = await createGithubAppAuth(undefined, ghesApiUrl);
  const githubClient = await createOctokitClient(ghAuth.token, ghesApiUrl);

  if (runnerType === 'Org') {
    return (
      await githubClient.apps.getOrgInstallation({
        org: runnerOwner,
      })
    ).data.id;
  }

  const [owner, repo] = runnerOwner.split('/');
  return (
    await githubClient.apps.getRepoInstallation({
      owner,
      repo,
    })
  ).data.id;
}

async function getGitHubRegisteredRunnerStatuses(
  ghClient: Octokit,
  runnerOwner: string,
  runnerNamePrefix: string,
  runnerType: GitHubRunnerType,
): Promise<Map<string, RunnerStatus>> {
  const runners =
    runnerType === 'Enterprise'
      ? ((await ghClient.paginate('GET /enterprises/{enterprise}/actions/runners', {
          enterprise: runnerOwner,
          per_page: 100,
        })) as { name: string; busy: boolean; status: string }[])
      : runnerType === 'Org'
        ? await ghClient.paginate(ghClient.actions.listSelfHostedRunnersForOrg, {
            org: runnerOwner,
            per_page: 100,
          })
        : await ghClient.paginate(ghClient.actions.listSelfHostedRunnersForRepo, {
            owner: runnerOwner.split('/')[0],
            repo: runnerOwner.split('/')[1],
            per_page: 100,
          });

  const runnerStatus = new Map<string, RunnerStatus>();
  for (const runner of runners) {
    runner.name = runnerNamePrefix ? runner.name.replace(runnerNamePrefix, '') : runner.name;
    runnerStatus.set(runner.name, { busy: runner.busy, status: runner.status });
  }
  return runnerStatus;
}
