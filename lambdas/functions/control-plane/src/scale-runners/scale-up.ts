import { addPersistentContextToChildLogger, createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { resolveRunnerProviderType } from '@aws-github-runner/runner-provider';
import { Octokit } from '@octokit/rest';
import yn from 'yn';

import {
  createEnterprisePATClient,
  createGithubAppAuth,
  createGithubInstallationAuth,
  createOctokitClient,
} from '../github/auth';
import { createScaleUpRunnerProvider } from '../runner-provider-registry';
import {
  getGitHubEnterpriseApiUrl,
  getInstallationId,
  isJobQueued,
  resolveInstallationId,
  UnsupportedEventError,
  validateSsmParameterStoreTags,
} from './github-runner';
import { publishRetryMessage } from './job-retry';
import { resolveRunnerType } from './runner-config';
import type { CreateScaleUpRunnersResult } from './scale-up-provider';
import type {
  ActionRequestMessage,
  ActionRequestMessageRetry,
  ActionRequestMessageSQS,
  CreateGitHubRunnerConfig,
  GitHubRunnerType,
} from './types';

const logger = createChildLogger('scale-up');

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const errorWithStatus = error as { status?: number; response?: { status?: number } };
  return errorWithStatus.status ?? errorWithStatus.response?.status;
}

async function createGithubInstallationClient(
  githubAppClient: Octokit,
  enableOrgLevel: boolean,
  payload: ActionRequestMessage,
  ghesApiUrl: string,
): Promise<Octokit> {
  let installationId = await getInstallationId(githubAppClient, enableOrgLevel, payload);

  try {
    const ghAuth = await createGithubInstallationAuth(installationId, ghesApiUrl);
    return await createOctokitClient(ghAuth.token, ghesApiUrl);
  } catch (error) {
    if (payload.installationId === 0 || getErrorStatus(error) !== 404) {
      throw error;
    }

    installationId = await resolveInstallationId(githubAppClient, enableOrgLevel, payload);
    if (installationId === payload.installationId) {
      throw error;
    }

    logger.warn('Retrying GitHub installation auth with installation resolved for current app', {
      eventInstallationId: payload.installationId,
      resolvedInstallationId: installationId,
      repositoryOwner: payload.repositoryOwner,
      repositoryName: payload.repositoryName,
    });

    const ghAuth = await createGithubInstallationAuth(installationId, ghesApiUrl);
    return await createOctokitClient(ghAuth.token, ghesApiUrl);
  }
}

export async function scaleUp(payloads: ActionRequestMessageSQS[]): Promise<string[]> {
  logger.info('Received scale up requests', {
    n_requests: payloads.length,
  });

  const runnerType = resolveRunnerType();
  const enableOrgLevel = runnerType !== 'Repo';
  const enterpriseSlug = process.env.ENTERPRISE_SLUG;
  const maximumRunners = parseInt(process.env.RUNNERS_MAXIMUM_COUNT || '3');
  const runnerLabels = process.env.RUNNER_LABELS || '';
  const runnerGroup = process.env.RUNNER_GROUP_NAME || 'Default';
  const ssmTokenPath = process.env.SSM_TOKEN_PATH;
  const ephemeralEnabled = yn(process.env.ENABLE_EPHEMERAL_RUNNERS, { default: false });
  const enableJitConfig = yn(process.env.ENABLE_JIT_CONFIG, { default: ephemeralEnabled });
  const disableAutoUpdate = yn(process.env.DISABLE_RUNNER_AUTOUPDATE, { default: false });
  const enableJobQueuedCheck = yn(process.env.ENABLE_JOB_QUEUED_CHECK, { default: true });
  const runnerNamePrefix = process.env.RUNNER_NAME_PREFIX || '';
  const ssmConfigPath = process.env.SSM_CONFIG_PATH || '';
  const ssmParameterStoreTags: { Key: string; Value: string }[] =
    process.env.SSM_PARAMETER_STORE_TAGS && process.env.SSM_PARAMETER_STORE_TAGS.trim() !== ''
      ? validateSsmParameterStoreTags(process.env.SSM_PARAMETER_STORE_TAGS)
      : [];
  const runnerProviderType = resolveRunnerProviderType(process.env.RUNNER_PROVIDER_TYPE);
  const runnerProvider = createScaleUpRunnerProvider(runnerProviderType);

  const { ghesApiUrl, ghesBaseUrl } = getGitHubEnterpriseApiUrl();

  if (runnerType === 'Enterprise' && !enterpriseSlug) {
    throw new Error('ENTERPRISE_SLUG must be set when RUNNER_REGISTRATION_LEVEL is enterprise.');
  }

  let githubAppClient: Octokit | undefined;
  if (runnerType !== 'Enterprise') {
    const ghAuth = await createGithubAppAuth(undefined, ghesApiUrl);
    githubAppClient = await createOctokitClient(ghAuth.token, ghesApiUrl);
  }

  type MessagesWithClient = {
    messages: ActionRequestMessageSQS[];
    githubInstallationClient: Octokit;
    runnerOwner: string;
  };

  let enterpriseClient: Octokit | undefined;
  if (runnerType === 'Enterprise') {
    enterpriseClient = await createEnterprisePATClient(ghesApiUrl);
  }

  const validMessages = new Map<string, MessagesWithClient>();
  const retryMessageIds = new Set<string>();
  for (const payload of payloads) {
    const { eventType, messageId, repositoryName, repositoryOwner, labels } = payload;
    if (ephemeralEnabled && eventType !== 'workflow_job') {
      logger.warn(
        'Event is not supported in combination with ephemeral runners. Please ensure you have enabled workflow_job events.',
        { eventType, messageId },
      );

      retryMessageIds.add(messageId);
      continue;
    }

    if (!isValidRepoOwnerType(payload, runnerType)) {
      logger.warn(
        'Repository does not belong to a GitHub organization and organization runners are enabled. This is not supported. Not scaling up for this event. Not throwing error to prevent re-queueing and just ignoring the event.',
        {
          repository: `${repositoryOwner}/${repositoryName}`,
          messageId,
        },
      );
      continue;
    }

    const runnerOwner =
      runnerType === 'Enterprise'
        ? enterpriseSlug!
        : runnerType === 'Org'
          ? payload.repositoryOwner
          : `${payload.repositoryOwner}/${payload.repositoryName}`;

    let key = runnerOwner;
    if (labels?.some((label) => label.startsWith('ghr-'))) {
      key = `${key}/${labelsHash(labels)}`;
    }

    let entry = validMessages.get(key);
    if (entry === undefined) {
      const githubInstallationClient =
        runnerType === 'Enterprise'
          ? enterpriseClient!
          : await createGithubInstallationClient(githubAppClient!, enableOrgLevel, payload, ghesApiUrl);

      entry = {
        messages: [],
        githubInstallationClient,
        runnerOwner,
      };
      validMessages.set(key, entry);
    }

    entry.messages.push(payload);
  }

  addPersistentContextToChildLogger({
    runner: {
      ephemeral: ephemeralEnabled,
      type: runnerType,
      namePrefix: runnerNamePrefix,
      n_events: Array.from(validMessages.values()).reduce((acc, group) => acc + group.messages.length, 0),
    },
  });

  logger.info('Received events');

  for (const [group, { githubInstallationClient, messages, runnerOwner }] of validMessages.entries()) {
    let scaleUp = 0;
    const queuedMessages: ActionRequestMessageSQS[] = [];
    let groupRunnerLabels = runnerLabels;

    const messageLabels = messages.length > 0 ? (messages[0].labels ?? []) : [];
    const preparedRunnerGroup = await runnerProvider.prepareGroup(messageLabels);
    const dynamicLabels = preparedRunnerGroup.runnerLabels;

    if (dynamicLabels.length > 0) {
      logger.debug('Dynamic labels present on message', { labels: dynamicLabels });
      groupRunnerLabels = groupRunnerLabels
        ? `${groupRunnerLabels},${dynamicLabels.join(',')}`
        : dynamicLabels.join(',');
      logger.debug('Updated runner labels', { runnerLabels: groupRunnerLabels });
    }

    for (const message of messages) {
      const messageLogger = logger.createChild({
        persistentKeys: {
          eventType: message.eventType,
          group,
          messageId: message.messageId,
          repository: `${message.repositoryOwner}/${message.repositoryName}`,
          labels: message.labels,
        },
      });

      if (enableJobQueuedCheck) {
        let jobQueued = true;
        try {
          jobQueued = await isJobQueued(githubInstallationClient, message);
        } catch (error) {
          if (error instanceof UnsupportedEventError) {
            continue;
          }
          const err = error as Error & { status?: number };
          messageLogger.warn('isJobQueued check failed, assuming job is still queued (fail-open)', {
            error: err.message,
            status: err.status,
          });
        }

        if (!jobQueued) {
          messageLogger.info('No runner will be created, job is not queued.');
          continue;
        }
      }

      scaleUp++;
      queuedMessages.push(message);
    }

    if (scaleUp === 0) {
      logger.info('No runners will be created for this group, no valid messages found.');
      continue;
    }

    const currentRunners =
      maximumRunners === -1
        ? 0
        : await runnerProvider.getCurrentRunners(preparedRunnerGroup.state, { runnerType, runnerOwner });

    logger.info('Current runners', {
      currentRunners,
      maximumRunners,
    });

    const newRunners =
      maximumRunners === -1 ? scaleUp : Math.max(0, Math.min(scaleUp, maximumRunners - currentRunners));
    const skippedRunnerCount = Math.max(0, scaleUp - newRunners);

    if (skippedRunnerCount > 0) {
      logger.info('Not all runners will be created for this group, maximum number of runners reached.', {
        desiredNewRunners: scaleUp,
      });

      if (ephemeralEnabled) {
        const removedMessages = messages.splice(0, skippedRunnerCount);
        removedMessages.forEach(({ messageId }) => retryMessageIds.add(messageId));
      }

      if (newRunners <= 0) {
        for (const message of queuedMessages) {
          if (!retryMessageIds.has(message.messageId)) {
            await publishRetryMessage(message as ActionRequestMessageRetry);
          }
        }
        continue;
      }
    }

    logger.info('Attempting to launch new runners', {
      newRunners,
    });

    const githubRunnerConfig: CreateGitHubRunnerConfig = {
      ephemeral: ephemeralEnabled,
      enableJitConfig,
      ghesBaseUrl,
      runnerLabels: groupRunnerLabels,
      runnerGroup,
      runnerNamePrefix,
      runnerOwner,
      runnerType,
      enterpriseSlug,
      disableAutoUpdate,
      ssmTokenPath,
      ssmConfigPath,
      ssmParameterStoreTags,
    };

    let createRunnersResult: CreateScaleUpRunnersResult;
    try {
      createRunnersResult = await runnerProvider.createRunners({
        githubRunnerConfig,
        numberOfRunners: newRunners,
        githubInstallationClient,
        state: preparedRunnerGroup.state,
      });
    } catch (error) {
      logger.error('Runner provider threw an unexpected error.', {
        error,
        retryable: true,
        failedMessageCount: newRunners,
      });
      createRunnersResult = {
        instances: [],
        retryableErrorCount: newRunners,
        nonRetryableErrorCount: 0,
      };
    }

    logger.info('Runner creation summary.', {
      requestedMessageCount: newRunners,
      successfulRunnerCount: createRunnersResult.instances.length,
      retryableErrorCount: createRunnersResult.retryableErrorCount,
      nonRetryableErrorCount: createRunnersResult.nonRetryableErrorCount,
    });

    if (createRunnersResult.nonRetryableErrorCount > 0) {
      logger.warn('Some runner creation messages will not be retried through the current SQS batch.', {
        nonRetryableErrorCount: createRunnersResult.nonRetryableErrorCount,
      });
    }

    if (createRunnersResult.retryableErrorCount > 0) {
      const failedMessages = messages.slice(0, createRunnersResult.retryableErrorCount);
      failedMessages.forEach(({ messageId }) => retryMessageIds.add(messageId));
    }

    for (const message of queuedMessages) {
      if (!retryMessageIds.has(message.messageId)) {
        await publishRetryMessage(message as ActionRequestMessageRetry);
      }
    }
  }

  return Array.from(retryMessageIds);
}

export function isValidRepoOwnerType(payload: ActionRequestMessage, runnerType: GitHubRunnerType): boolean {
  if (runnerType === 'Enterprise') {
    return true;
  }
  if (runnerType === 'Org') {
    return payload.repoOwnerType === 'Organization';
  }
  return true;
}

function labelsHash(labels: string[]): string {
  const prefix = 'ghr-';
  const input = labels
    .filter((label) => label.startsWith(prefix))
    .sort()
    .join('|');

  let hash = 0;
  for (let index = 0; index < input.length; index++) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}
