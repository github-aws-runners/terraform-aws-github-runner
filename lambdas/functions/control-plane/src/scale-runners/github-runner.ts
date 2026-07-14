import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { getParameter, putParameter } from '@aws-github-runner/aws-ssm-util';
import { Octokit } from '@octokit/rest';

import { metricGitHubAppRateLimit } from '../github/rate-limit';
import { ActionRequestMessage, CreateGitHubRunnerConfig, EphemeralRunnerConfig, RunnerGroup } from './types';

const logger = createChildLogger('github-runner');

export interface GitHubRunnerMetadata {
  githubRunnerId: string;
  runnerLabels: string[];
}

export interface StartRunnerConfigOptions {
  getSsmParameterTags?: (runnerId: string) => { Key: string; Value: string }[];
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

export function validateSsmParameterStoreTags(tagsJson: string): { Key: string; Value: string }[] {
  try {
    const tags = JSON.parse(tagsJson);

    if (!Array.isArray(tags)) {
      throw new Error('Tags must be an array');
    }

    if (tags.length === 0) {
      return [];
    }

    tags.forEach((tag, index) => {
      if (typeof tag !== 'object' || tag === null) {
        throw new Error(`Tag at index ${index} must be an object`);
      }
      if (!tag.Key || typeof tag.Key !== 'string' || tag.Key.trim() === '') {
        throw new Error(`Tag at index ${index} has missing or invalid 'Key' property`);
      }
      if (!Object.prototype.hasOwnProperty.call(tag, 'Value') || typeof tag.Value !== 'string') {
        throw new Error(`Tag at index ${index} has missing or invalid 'Value' property`);
      }
    });

    return tags;
  } catch (err) {
    logger.error('Invalid SSM_PARAMETER_STORE_TAGS format', { error: err });
    throw new Error(`Failed to parse SSM_PARAMETER_STORE_TAGS: ${(err as Error).message}`);
  }
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
): Promise<number> {
  if (payload.installationId !== 0) {
    return payload.installationId;
  }

  return resolveInstallationId(githubAppClient, enableOrgLevel, payload);
}

export async function isJobQueued(githubInstallationClient: Octokit, payload: ActionRequestMessage): Promise<boolean> {
  let isQueued = false;
  if (payload.eventType === 'workflow_job') {
    const jobForWorkflowRun = await githubInstallationClient.actions.getJobForWorkflowRun({
      job_id: payload.id,
      owner: payload.repositoryOwner,
      repo: payload.repositoryName,
    });
    metricGitHubAppRateLimit(jobForWorkflowRun.headers);
    isQueued = jobForWorkflowRun.data.status === 'queued';
    logger.debug(`The job ${payload.id} is${isQueued ? ' ' : 'not'} queued`);
  } else {
    throw Error(`Event ${payload.eventType} is not supported`);
  }
  return isQueued;
}

export async function getRunnerGroupId(
  githubRunnerConfig: CreateGitHubRunnerConfig,
  ghClient: Octokit,
): Promise<number> {
  // if the runnerType is Repo, then runnerGroupId is default to 1
  let runnerGroupId: number | undefined = 1;
  if (githubRunnerConfig.runnerType === 'Org' && githubRunnerConfig.runnerGroup !== undefined) {
    let runnerGroup: string | undefined;
    // check if runner group id is already stored in SSM Parameter Store and
    // use it if it exists to avoid API call to GitHub
    try {
      runnerGroup = await getParameter(
        `${githubRunnerConfig.ssmConfigPath}/runner-group/${githubRunnerConfig.runnerGroup}`,
      );
    } catch (err) {
      logger.debug('Handling error:', err as Error);
      logger.warn(
        `SSM Parameter "${githubRunnerConfig.ssmConfigPath}/runner-group/${githubRunnerConfig.runnerGroup}"
         for Runner group ${githubRunnerConfig.runnerGroup} does not exist`,
      );
    }
    if (runnerGroup === undefined) {
      // get runner group id from GitHub
      runnerGroupId = await getRunnerGroupByName(ghClient, githubRunnerConfig);
      // store runner group id in SSM
      try {
        await putParameter(
          `${githubRunnerConfig.ssmConfigPath}/runner-group/${githubRunnerConfig.runnerGroup}`,
          runnerGroupId.toString(),
          false,
          {
            tags: githubRunnerConfig.ssmParameterStoreTags,
          },
        );
      } catch (err) {
        logger.debug('Error storing runner group id in SSM Parameter Store', err as Error);
        throw err;
      }
    } else {
      runnerGroupId = parseInt(runnerGroup);
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
  if (githubRunnerConfig.enableJitConfig && githubRunnerConfig.ephemeral) {
    return await createJitConfig(githubRunnerConfig, runnerIds, ghClient, options);
  } else {
    return await createRegistrationTokenConfig(githubRunnerConfig, runnerIds, ghClient, options);
  }
}

function addDelay(runnerIds: string[]) {
  const delay = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const ssmParameterStoreMaxThroughput = 40;
  const isDelay = runnerIds.length >= ssmParameterStoreMaxThroughput;
  return { isDelay, delay };
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
  options: StartRunnerConfigOptions,
): Promise<string[]> {
  const { isDelay, delay } = addDelay(runnerIds);
  const token = await getGithubRunnerRegistrationToken(githubRunnerConfig, ghClient);
  const runnerServiceConfig = generateRunnerServiceConfig(githubRunnerConfig, token);

  logger.debug('Runner service config for non-ephemeral runners', {
    runner_service_config: removeTokenFromLogging(runnerServiceConfig),
  });

  for (const runnerId of runnerIds) {
    await putParameter(`${githubRunnerConfig.ssmTokenPath}/${runnerId}`, runnerServiceConfig.join(' '), true, {
      tags: [...(options.getSsmParameterTags?.(runnerId) ?? []), ...githubRunnerConfig.ssmParameterStoreTags],
    });
    if (isDelay) {
      // Delay to prevent AWS ssm rate limits by being within the max throughput limit
      await delay(25);
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
  options: StartRunnerConfigOptions,
): Promise<string[]> {
  const runnerGroupId = await getRunnerGroupId(githubRunnerConfig, ghClient);
  const { isDelay, delay } = addDelay(runnerIds);
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

      metricGitHubAppRateLimit(runnerConfig.headers);

      await options.onJitConfigCreated?.(runnerId, {
        githubRunnerId: runnerConfig.data.runner.id.toString(),
        runnerLabels,
      });

      // store jit config in ssm parameter store
      logger.debug('Runner JIT config for ephemeral runner generated.', {
        instance: runnerId,
      });
      await putParameter(`${githubRunnerConfig.ssmTokenPath}/${runnerId}`, runnerConfig.data.encoded_jit_config, true, {
        tags: [...(options.getSsmParameterTags?.(runnerId) ?? []), ...githubRunnerConfig.ssmParameterStoreTags],
      });
      if (isDelay) {
        // Delay to prevent AWS ssm rate limits by being within the max throughput limit
        await delay(25);
      }
    } catch (error) {
      failedRunnerIds.push(runnerId);
      logger.warn('Failed to create JIT config for instance, continuing with remaining instances', {
        instance: runnerId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (failedRunnerIds.length > 0) {
    logger.error('Failed to create JIT config for some instances', {
      failedInstances: failedRunnerIds,
      totalInstances: runnerIds.length,
      successfulInstances: runnerIds.length - failedRunnerIds.length,
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
