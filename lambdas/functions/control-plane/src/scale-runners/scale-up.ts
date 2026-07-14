import { addPersistentContextToChildLogger, createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { Octokit } from '@octokit/rest';
import yn from 'yn';

import { createGithubAppAuth, createGithubInstallationAuth, createOctokitClient } from '../github/auth';
import { resolveRunnerProviderType } from '../runner-provider';
import {
  getGitHubEnterpriseApiUrl,
  getInstallationId,
  resolveInstallationId,
  isJobQueued,
  validateSsmParameterStoreTags,
} from './github-runner';
import { publishRetryMessage } from './job-retry';
import { createScaleUpRunnerProvider } from './scale-up-provider-registry';
import type {
  ActionRequestMessage,
  ActionRequestMessageRetry,
  ActionRequestMessageSQS,
  CreateGitHubRunnerConfig,
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

  const enableOrgLevel = yn(process.env.ENABLE_ORGANIZATION_RUNNERS, { default: true });
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

  const ghAuth = await createGithubAppAuth(undefined, ghesApiUrl);
  const githubAppClient = await createOctokitClient(ghAuth.token, ghesApiUrl);

  // A map of either owner or owner/repo name to Octokit client, so we use a
  // single client per installation (set of messages), depending on how the app
  // is installed. This is for a couple of reasons:
  // - Sharing clients opens up the possibility of caching API calls.
  // - Fetching a client for an installation actually requires a couple of API
  //   calls itself, which would get expensive if done for every message in a
  //   batch.
  type MessagesWithClient = {
    messages: ActionRequestMessageSQS[];
    githubInstallationClient: Octokit;
    runnerOwner: string;
  };

  const validMessages = new Map<string, MessagesWithClient>();
  const rejectedMessageIds = new Set<string>();
  for (const payload of payloads) {
    const { eventType, messageId, repositoryName, repositoryOwner, labels } = payload;
    if (ephemeralEnabled && eventType !== 'workflow_job') {
      logger.warn(
        'Event is not supported in combination with ephemeral runners. Please ensure you have enabled workflow_job events.',
        { eventType, messageId },
      );

      rejectedMessageIds.add(messageId);

      continue;
    }

    if (!isValidRepoOwnerTypeIfOrgLevelEnabled(payload, enableOrgLevel)) {
      logger.warn(
        `Repository does not belong to a GitHub organization and organization runners are enabled. This is not supported. Not scaling up for this event. Not throwing error to prevent re-queueing and just ignoring the event.`,
        {
          repository: `${repositoryOwner}/${repositoryName}`,
          messageId,
        },
      );

      continue;
    }

    const runnerOwner = enableOrgLevel
      ? payload.repositoryOwner
      : `${payload.repositoryOwner}/${payload.repositoryName}`;

    let key = runnerOwner;
    if (labels?.some((l) => l.startsWith('ghr-'))) {
      const dynamicLabelsHash = labelsHash(labels);
      key = `${key}/${dynamicLabelsHash}`;
    }

    let entry = validMessages.get(key);

    // If we've not seen this owner/repo before, we'll need to create a GitHub
    // client for it.
    if (entry === undefined) {
      const githubInstallationClient = await createGithubInstallationClient(
        githubAppClient,
        enableOrgLevel,
        payload,
        ghesApiUrl,
      );

      entry = {
        messages: [],
        githubInstallationClient,
        runnerOwner: runnerOwner,
      };

      validMessages.set(key, entry);
    }

    entry.messages.push(payload);
  }

  const runnerType = enableOrgLevel ? 'Org' : 'Repo';

  addPersistentContextToChildLogger({
    runner: {
      ephemeral: ephemeralEnabled,
      type: runnerType,
      namePrefix: runnerNamePrefix,
      n_events: Array.from(validMessages.values()).reduce((acc, group) => acc + group.messages.length, 0),
    },
  });

  logger.info(`Received events`);

  for (const [group, { githubInstallationClient, messages, runnerOwner }] of validMessages.entries()) {
    // Work out how much we want to scale up by.
    let scaleUp = 0;
    const queuedMessages: ActionRequestMessageSQS[] = [];

    // Reset per group to avoid accumulating labels across iterations
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

      if (enableJobQueuedCheck && !(await isJobQueued(githubInstallationClient, message))) {
        messageLogger.info('No runner will be created, job is not queued.');

        continue;
      }

      scaleUp++;
      queuedMessages.push(message);
    }

    if (scaleUp === 0) {
      logger.info('No runners will be created for this group, no valid messages found.');

      continue;
    }

    // Don't query the provider if we can create an unlimited number of runners.
    const currentRunners =
      maximumRunners === -1
        ? 0
        : await runnerProvider.getCurrentRunners(preparedRunnerGroup.state, { runnerType, runnerOwner });

    logger.info('Current runners', {
      currentRunners,
      maximumRunners,
    });

    // Calculate how many runners we want to create.
    // Use Math.max(0, ...) to ensure we never attempt to create a negative number of runners,
    // which can happen when currentRunners exceeds maximumRunners due to pool/scale-up race conditions.
    const newRunners =
      maximumRunners === -1
        ? // If we don't have an upper limit, scale up by the number of new jobs.
          scaleUp
        : // Otherwise, we do have a limit, so work out if `scaleUp` would exceed it.
          Math.max(0, Math.min(scaleUp, maximumRunners - currentRunners));

    const skippedRunnerCount = Math.max(0, scaleUp - newRunners);

    if (skippedRunnerCount > 0) {
      logger.info('Not all runners will be created for this group, maximum number of runners reached.', {
        desiredNewRunners: scaleUp,
      });

      if (ephemeralEnabled) {
        // This removes `skippedRunnerCount` items from the start of the array
        // so that, if we retry more messages later, we pick fresh ones.
        const removedMessages = messages.splice(0, skippedRunnerCount);
        removedMessages.forEach(({ messageId }) => rejectedMessageIds.add(messageId));
      }

      // No runners will be created, so skip calling the provider.
      if (newRunners <= 0) {
        // Publish retry messages for messages that are not rejected
        for (const message of queuedMessages) {
          if (!rejectedMessageIds.has(message.messageId)) {
            await publishRetryMessage(message as ActionRequestMessageRetry);
          }
        }
        continue;
      }
    }

    logger.info(`Attempting to launch new runners`, {
      newRunners,
    });

    const githubRunnerConfig: CreateGitHubRunnerConfig = {
      ephemeral: ephemeralEnabled,
      enableJitConfig,
      ghesBaseUrl,
      runnerLabels: groupRunnerLabels,
      runnerGroup,
      runnerNamePrefix,
      runnerOwner: runnerOwner,
      runnerType,
      disableAutoUpdate,
      ssmTokenPath,
      ssmConfigPath,
      ssmParameterStoreTags,
    };

    const createdRunners = await runnerProvider.createRunners({
      githubRunnerConfig,
      numberOfRunners: newRunners,
      githubInstallationClient,
      messages: queuedMessages.slice(0, newRunners),
      state: preparedRunnerGroup.state,
    });

    // Not all runners we wanted were created, let's reject enough items so that
    // number of entries will be retried.
    if (createdRunners.length !== newRunners) {
      const failedRunnerCount = newRunners - createdRunners.length;

      logger.warn('Some runners failed to be created, rejecting some messages so the requests are retried', {
        wanted: newRunners,
        got: createdRunners.length,
        failedInstanceCount: failedRunnerCount,
      });

      const failedMessages = messages.slice(0, failedRunnerCount);
      failedMessages.forEach(({ messageId }) => rejectedMessageIds.add(messageId));
    }

    // Publish retry messages for messages that are not rejected
    for (const message of queuedMessages) {
      if (!rejectedMessageIds.has(message.messageId)) {
        await publishRetryMessage(message as ActionRequestMessageRetry);
      }
    }
  }

  return Array.from(rejectedMessageIds);
}

function isValidRepoOwnerTypeIfOrgLevelEnabled(payload: ActionRequestMessage, enableOrgLevel: boolean): boolean {
  return !(enableOrgLevel && payload.repoOwnerType !== 'Organization');
}

function labelsHash(labels: string[]): string {
  const prefix = 'ghr-';

  const input = labels
    .filter((l) => l.startsWith(prefix))
    .sort() // ensure deterministic hash
    .join('|');

  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0; // force 32-bit integer
  }

  return Math.abs(hash).toString(36);
}
