import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import {
  createStorageProviders,
  type RunnerConfigMetadata,
  type RunnerConfigStore,
  type GitHubAppCredentialsStore,
  type RunnerGroupCacheStore,
} from '@aws-github-runner/storage-providers';
import { Octokit } from '@octokit/rest';

import { getStoredInstallationId } from '../github/auth';
import { metricGitHubAppRateLimit } from '../github/rate-limit';
import { ActionRequestMessage, CreateGitHubRunnerConfig, EphemeralRunnerConfig, RunnerGroup } from './types';

const logger = createChildLogger('github-runner');

export interface GitHubRunnerMetadata {
  githubRunnerId: string;
  runnerLabels: string[];
}

export interface StartRunnerConfigOptions {
  runnerConfigStore?: RunnerConfigStore;
  runnerGroupCacheStore?: RunnerGroupCacheStore;
  getRunnerConfigMetadata?: (runnerId: string) => RunnerConfigMetadata[];
  onJitConfigCreated?: (runnerId: string, metadata: GitHubRunnerMetadata) => Promise<void>;
}

function generateRunnerServiceConfig(githubRunnerConfig: CreateGitHubRunnerConfig, token: string) {
  const config = [
    `--url ${githubRunnerConfig.ghesBaseUrl ?? 'https://github.com'}/${githubRunnerConfig.runnerOwner}`,
    `--token ${token}`,
  ];

  if (githubRunnerConfig.runnerLabels) {
    config.push(`--labels ${quoteRunnerLabelsForShell(githubRunnerConfig.runnerLabels)}`.trim());
  }

  if (githubRunnerConfig.disableAutoUpdate) {
    config.push('--disableupdate');
  }

  if (githubRunnerConfig.runnerType === 'Org' && githubRunnerConfig.runnerGroup !== undefined) {
    config.push(`--runnergroup ${githubRunnerConfig.runnerGroup}`);
  }

  if (githubRunnerConfig.ephemeral) {
    config.push(`--ephemeral`);
  }

  return config;
}

function quoteRunnerLabelsForShell(labels: string): string {
  return /[\s;&|<>()$`"'*?[\\\]{}!]/.test(labels) ? quoteShellArg(labels) : labels;
}

function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function getGithubRunnerRegistrationToken(githubRunnerConfig: CreateGitHubRunnerConfig, ghClient: Octokit) {
  const registrationToken =
    githubRunnerConfig.runnerType === 'Org'
      ? await ghClient.actions.createRegistrationTokenForOrg({ org: githubRunnerConfig.runnerOwner })
      : await ghClient.actions.createRegistrationTokenForRepo({
          owner: githubRunnerConfig.runnerOwner.split('/')[0],
          repo: githubRunnerConfig.runnerOwner.split('/')[1],
        });

  return registrationToken.data.token;
}

function removeTokenFromLogging(config: string[]): string[] {
  const result: string[] = [];
  config.forEach((e) => {
    if (e.startsWith('--token')) {
      result.push('--token <REDACTED>');
    } else {
      result.push(e);
    }
  });
  return result;
}

export async function resolveInstallationId(
  githubAppClient: Octokit,
  enableOrgLevel: boolean,
  payload: ActionRequestMessage,
): Promise<number> {
  return enableOrgLevel
    ? (
        await githubAppClient.apps.getOrgInstallation({
          org: payload.repositoryOwner,
        })
      ).data.id
    : (
        await githubAppClient.apps.getRepoInstallation({
          owner: payload.repositoryOwner,
          repo: payload.repositoryName,
        })
      ).data.id;
}

export async function getInstallationId(
  githubAppClient: Octokit,
  enableOrgLevel: boolean,
  payload: ActionRequestMessage,
  appIndex?: number,
  credentialsStore?: GitHubAppCredentialsStore,
): Promise<number> {
  // Use the pre-configured installation ID when available (avoids an API call).
  if (appIndex !== undefined) {
    const storedId = await getStoredInstallationId(appIndex, credentialsStore);
    if (storedId !== undefined) return storedId;
  }

  // The primary app (index 0, or the single-app case where appIndex is undefined) can reuse
  // the installation id carried on the webhook payload, since the webhook is delivered by the
  // primary app. Additional apps must resolve their own installation id via the API.
  const isPrimaryApp = appIndex === undefined || appIndex === 0;
  if (isPrimaryApp && payload.installationId !== 0) {
    return payload.installationId;
  }

  return resolveInstallationId(githubAppClient, enableOrgLevel, payload);
}

// Raised when the queued-check is asked about an event type it cannot interpret.
// Distinct from an API failure: no amount of retrying makes a check_run event
// answerable, so callers must not treat this as a transient fault.
export class UnsupportedEventError extends Error {
  constructor(eventType: string) {
    super(`Event ${eventType} is not supported`);
    this.name = 'UnsupportedEventError';
  }
}

export async function isJobQueued(
  githubInstallationClient: Octokit,
  payload: ActionRequestMessage,
  appIndex?: number,
): Promise<boolean> {
  let isQueued = false;
  if (payload.eventType === 'workflow_job') {
    const jobForWorkflowRun = await githubInstallationClient.actions.getJobForWorkflowRun({
      job_id: payload.id,
      owner: payload.repositoryOwner,
      repo: payload.repositoryName,
    });
    metricGitHubAppRateLimit(jobForWorkflowRun.headers, appIndex);
    isQueued = jobForWorkflowRun.data.status === 'queued';
    logger.debug(`The job ${payload.id} is${isQueued ? ' ' : 'not'} queued`);
  } else {
    throw new UnsupportedEventError(payload.eventType);
  }
  return isQueued;
}

export async function getRunnerGroupId(
  githubRunnerConfig: CreateGitHubRunnerConfig,
  ghClient: Octokit,
  runnerGroupCacheStore?: RunnerGroupCacheStore,
): Promise<number> {
  // if the runnerType is Repo, then runnerGroupId is default to 1
  let runnerGroupId: number | undefined = 1;
  if (githubRunnerConfig.runnerType === 'Org' && githubRunnerConfig.runnerGroup !== undefined) {
    const cacheStore = runnerGroupCacheStore ?? createStorageProviders().runnerGroupCache;
    const runnerGroup = await cacheStore.get(githubRunnerConfig.runnerGroup);
    if (runnerGroup === undefined) {
      // get runner group id from GitHub
      runnerGroupId = await getRunnerGroupByName(ghClient, githubRunnerConfig);
      await cacheStore.create({
        runnerGroupName: githubRunnerConfig.runnerGroup,
        runnerGroupId,
      });
    } else {
      runnerGroupId = runnerGroup;
    }
  }
  return runnerGroupId;
}

async function getRunnerGroupByName(ghClient: Octokit, githubRunnerConfig: CreateGitHubRunnerConfig): Promise<number> {
  const runnerGroups: RunnerGroup[] = await ghClient.paginate(`GET /orgs/{org}/actions/runner-groups`, {
    org: githubRunnerConfig.runnerOwner,
    per_page: 100,
  });
  const runnerGroupId = runnerGroups.find((runnerGroup) => runnerGroup.name === githubRunnerConfig.runnerGroup)?.id;

  if (runnerGroupId === undefined) {
    throw new Error(`Runner group ${githubRunnerConfig.runnerGroup} does not exist`);
  }

  return runnerGroupId;
}

/**
 * Creates the start configuration for runner targets by either generating JIT configs
 * or registration tokens.
 *
 * @returns Array of runner IDs that failed to get configured
 */
export async function createStartRunnerConfig(
  githubRunnerConfig: CreateGitHubRunnerConfig,
  runnerIds: string[],
  ghClient: Octokit,
  options: StartRunnerConfigOptions = {},
): Promise<string[]> {
  const runnerConfigStore = options.runnerConfigStore ?? createStorageProviders().runnerConfig;
  if (githubRunnerConfig.enableJitConfig && githubRunnerConfig.ephemeral) {
    return await createJitConfig(githubRunnerConfig, runnerIds, ghClient, runnerConfigStore, options);
  } else {
    return await createRegistrationTokenConfig(githubRunnerConfig, runnerIds, ghClient, runnerConfigStore, options);
  }
}

function addDelay(runnerIds: string[], runnerConfigStore: RunnerConfigStore) {
  const delay = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const maxWritesPerSecond = runnerConfigStore.maxWritesPerSecond;
  const isDelay = maxWritesPerSecond !== undefined && runnerIds.length >= maxWritesPerSecond;
  const delayMilliseconds = maxWritesPerSecond === undefined ? 0 : 1000 / maxWritesPerSecond;
  return { isDelay, delay, delayMilliseconds };
}

/**
 * Creates registration token configuration for non-ephemeral runners.
 *
 * @returns Empty array (this configuration method does not have failure cases)
 */
async function createRegistrationTokenConfig(
  githubRunnerConfig: CreateGitHubRunnerConfig,
  runnerIds: string[],
  ghClient: Octokit,
  runnerConfigStore: RunnerConfigStore,
  options: StartRunnerConfigOptions,
): Promise<string[]> {
  const { isDelay, delay, delayMilliseconds } = addDelay(runnerIds, runnerConfigStore);
  const token = await getGithubRunnerRegistrationToken(githubRunnerConfig, ghClient);
  const runnerServiceConfig = generateRunnerServiceConfig(githubRunnerConfig, token);

  logger.debug('Runner service config for non-ephemeral runners', {
    runner_service_config: removeTokenFromLogging(runnerServiceConfig),
  });

  for (const runnerId of runnerIds) {
    await runnerConfigStore.create(
      { runnerId, value: runnerServiceConfig.join(' ') },
      { metadata: options.getRunnerConfigMetadata?.(runnerId) },
    );
    if (isDelay) {
      // Delay to stay within the selected store's maximum write throughput.
      await delay(delayMilliseconds);
    }
  }

  return [];
}

/**
 * Creates JIT (Just-In-Time) configuration for ephemeral runners.
 * Continues processing remaining runners even if some fail.
 *
 * @returns Array of runner IDs that failed to get JIT configuration
 */
async function createJitConfig(
  githubRunnerConfig: CreateGitHubRunnerConfig,
  runnerIds: string[],
  ghClient: Octokit,
  runnerConfigStore: RunnerConfigStore,
  options: StartRunnerConfigOptions,
): Promise<string[]> {
  const runnerGroupId = await getRunnerGroupId(githubRunnerConfig, ghClient, options.runnerGroupCacheStore);
  const { isDelay, delay, delayMilliseconds } = addDelay(runnerIds, runnerConfigStore);
  const runnerLabels = githubRunnerConfig.runnerLabels.split(',');
  const failedRunnerIds: string[] = [];

  logger.debug(`Runner group id: ${runnerGroupId}`);
  logger.debug(`Runner labels: ${runnerLabels}`);
  for (const runnerId of runnerIds) {
    try {
      // generate jit config for runner registration
      const ephemeralRunnerConfig: EphemeralRunnerConfig = {
        runnerName: `${githubRunnerConfig.runnerNamePrefix}${runnerId}`,
        runnerGroupId: runnerGroupId,
        runnerLabels: runnerLabels,
      };
      logger.debug(`Runner name: ${ephemeralRunnerConfig.runnerName}`);
      const runnerConfig =
        githubRunnerConfig.runnerType === 'Org'
          ? await ghClient.actions.generateRunnerJitconfigForOrg({
              org: githubRunnerConfig.runnerOwner,
              name: ephemeralRunnerConfig.runnerName,
              runner_group_id: ephemeralRunnerConfig.runnerGroupId,
              labels: ephemeralRunnerConfig.runnerLabels,
            })
          : await ghClient.actions.generateRunnerJitconfigForRepo({
              owner: githubRunnerConfig.runnerOwner.split('/')[0],
              repo: githubRunnerConfig.runnerOwner.split('/')[1],
              name: ephemeralRunnerConfig.runnerName,
              runner_group_id: ephemeralRunnerConfig.runnerGroupId,
              labels: ephemeralRunnerConfig.runnerLabels,
            });

      metricGitHubAppRateLimit(runnerConfig.headers, githubRunnerConfig.appIndex);

      await options.onJitConfigCreated?.(runnerId, {
        githubRunnerId: runnerConfig.data.runner.id.toString(),
        runnerLabels,
      });

      logger.debug('Runner JIT config for ephemeral runner generated.', {
        instance: runnerId,
      });
      await runnerConfigStore.create(
        { runnerId, value: runnerConfig.data.encoded_jit_config },
        { metadata: options.getRunnerConfigMetadata?.(runnerId) },
      );
      if (isDelay) {
        // Delay to stay within the selected store's maximum write throughput.
        await delay(delayMilliseconds);
      }
    } catch (error) {
      failedRunnerIds.push(runnerId);
      logger.warn('Failed to create JIT config for instance, continuing with remaining instances', {
        instance: runnerId,
        error: error instanceof Error ? error.message : String(error),
        retryable: true,
      });
    }
  }

  if (failedRunnerIds.length > 0) {
    logger.error('Failed to create JIT config for some instances', {
      failedInstances: failedRunnerIds,
      totalInstances: runnerIds.length,
      successfulInstances: runnerIds.length - failedRunnerIds.length,
      retryable: true,
    });
  }

  return failedRunnerIds;
}

export function getGitHubEnterpriseApiUrl() {
  const ghesBaseUrl = process.env.GHES_URL;
  let ghesApiUrl = '';
  if (ghesBaseUrl) {
    const url = new URL(ghesBaseUrl);
    const domain = url.hostname;
    if (domain.endsWith('.ghe.com')) {
      // Data residency: Prepend 'api.'
      ghesApiUrl = `https://api.${domain}`;
    } else {
      // GitHub Enterprise Server: Append '/api/v3'
      ghesApiUrl = `${ghesBaseUrl}/api/v3`;
    }
  }
  logger.debug(`Github Enterprise URLs: api_url - ${ghesApiUrl}; base_url - ${ghesBaseUrl}`);
  return { ghesApiUrl, ghesBaseUrl };
}
