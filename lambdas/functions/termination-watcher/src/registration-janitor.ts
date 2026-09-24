import { createHash } from 'node:crypto';
import {
  createRegistrationCleanupProvider,
  type RegistrationCleanupProvider,
  type RegistrationCleanupProviderConfig,
} from '@aws-github-runner/compute-providers/registration-cleanup';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { createChildLogger, setContext } from '@aws-github-runner/aws-powertools-util';
import type { Context, SQSEvent, SQSBatchResponse } from 'aws-lambda';
import type { Octokit } from '@octokit/rest';

import { createRunnerInstallationClient, type InstallationClientCache } from './github-app-client';

const logger = createChildLogger('registration-janitor');
const confirmationSeconds = 900;

export interface RegistrationJanitorConfig {
  organization: string;
  runnerGroupIds: number[];
  runnerNamePrefix: string;
  computeProvider: RegistrationCleanupProviderConfig;
  dryRun: boolean;
  maxCandidates: number;
  ghesApiUrl: string;
}

interface Candidate {
  runnerId: number;
  runnerName: string;
  resourceId: string;
  observedAt: number;
  scope: string;
  groupId: number;
}

function loadConfig(): RegistrationJanitorConfig {
  const config = JSON.parse(process.env.REGISTRATION_JANITOR_CONFIG ?? '{}') as RegistrationJanitorConfig;
  if (
    !config.organization ||
    !config.runnerNamePrefix ||
    !Array.isArray(config.runnerGroupIds) ||
    config.runnerGroupIds.length === 0 ||
    !config.runnerGroupIds.every((id) => Number.isSafeInteger(id) && id > 0) ||
    typeof config.dryRun !== 'boolean' ||
    !Number.isSafeInteger(config.maxCandidates) ||
    config.maxCandidates < 1 ||
    config.maxCandidates > 1000
  ) {
    throw new Error('Invalid REGISTRATION_JANITOR_CONFIG');
  }
  return {
    ...config,
    runnerGroupIds: [...config.runnerGroupIds].sort((a, b) => a - b),
  };
}

function scopeKey(config: RegistrationJanitorConfig, provider: RegistrationCleanupProvider): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        organization: config.organization,
        runnerNamePrefix: config.runnerNamePrefix,
        computeProvider: { type: config.computeProvider.type, scope: provider.scope },
        runnerGroupIds: [...config.runnerGroupIds].sort((a, b) => a - b),
        ghesApiUrl: config.ghesApiUrl,
      }),
    )
    .digest('hex');
}

async function groupPage(client: Octokit, config: RegistrationJanitorConfig, groupId: number, page: number) {
  return (
    await client.request('GET /orgs/{org}/actions/runner-groups/{runner_group_id}/runners', {
      org: config.organization,
      runner_group_id: groupId,
      page,
      per_page: 100,
    })
  ).data.runners;
}

async function enqueue(candidate: Candidate, delaySeconds: number): Promise<void> {
  const queueUrl = process.env.REGISTRATION_JANITOR_QUEUE_URL;
  if (!queueUrl) throw new Error('REGISTRATION_JANITOR_QUEUE_URL is required');
  await new SQSClient({}).send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      DelaySeconds: delaySeconds,
      MessageBody: JSON.stringify(candidate),
    }),
  );
}

async function discover(
  config: RegistrationJanitorConfig,
  context: Context,
  provider: RegistrationCleanupProvider,
  clients: InstallationClientCache,
): Promise<void> {
  let candidates = 0;
  const summary = {
    pagesScanned: 0,
    candidatesQueued: 0,
    dryRunCandidates: 0,
    existingResources: 0,
    pageFailures: 0,
    candidateFailures: 0,
    stopReason: 'completed',
  };
  const shouldStop = () => {
    if (context.getRemainingTimeInMillis() < 10000) {
      summary.stopReason = 'deadline';
      return true;
    }
    if (candidates >= config.maxCandidates) {
      summary.stopReason = 'candidate-limit';
      return true;
    }
    return false;
  };
  try {
    for (const groupId of config.runnerGroupIds) {
      let failures = 0;
      for (let page = 1; ; page++) {
        if (shouldStop()) return;
        let runners;
        try {
          const client = await createRunnerInstallationClient(config.organization, 'Org', config.ghesApiUrl, clients);
          runners = await groupPage(client, config, groupId, page);
          summary.pagesScanned++;
          failures = 0;
        } catch (error) {
          summary.pageFailures++;
          logger.warn('Skipping unavailable discovery page', { error, groupId, page });
          // Isolate a broken group while still trying later pages after a transient failure.
          if (++failures >= 3) break;
          continue;
        }
        for (const runner of runners) {
          if (shouldStop()) return;
          if (runner.status !== 'offline' || runner.busy !== false) continue;
          try {
            const resourceId = provider.resourceIdFromRunnerName(runner.name);
            if (!resourceId) continue;
            if (await provider.exists(resourceId)) {
              summary.existingResources++;
              continue;
            }
            const candidate: Candidate = {
              runnerId: runner.id,
              runnerName: runner.name,
              resourceId,
              groupId,
              observedAt: Date.now(),
              scope: scopeKey(config, provider),
            };
            if (config.dryRun) {
              logger.info('Would confirm stale registration', { candidate });
              summary.dryRunCandidates++;
            } else {
              await enqueue(candidate, confirmationSeconds);
              summary.candidatesQueued++;
            }
            candidates++;
          } catch (error) {
            summary.candidateFailures++;
            logger.warn('Skipping unverified candidate', { error, runnerId: runner.id });
          }
        }
        if (runners.length < 100) break;
      }
    }
  } finally {
    logger.info('Registration discovery finished.', { ...summary, dryRun: config.dryRun });
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 404;
}

function requireConfirmationTime(context: Context): void {
  if (context.getRemainingTimeInMillis() < 10000) throw new Error('Insufficient time to confirm registration');
}

async function confirm(
  client: Octokit,
  config: RegistrationJanitorConfig,
  candidate: Candidate,
  context: Context,
  provider: RegistrationCleanupProvider,
): Promise<void> {
  const elapsed = Date.now() - candidate.observedAt;
  if (
    candidate.scope !== scopeKey(config, provider) ||
    !config.runnerGroupIds.includes(candidate.groupId) ||
    typeof candidate.resourceId !== 'string' ||
    provider.resourceIdFromRunnerName(candidate.runnerName) !== candidate.resourceId ||
    !Number.isSafeInteger(candidate.runnerId) ||
    candidate.runnerId < 1 ||
    !Number.isFinite(elapsed) ||
    elapsed > 24 * 60 * 60 * 1000
  ) {
    logger.warn('Discarding stale or out-of-scope registration candidate');
    return;
  }
  if (elapsed < confirmationSeconds * 1000) throw new Error('Registration confirmation arrived too early');
  if (config.dryRun) return;

  // A runner moved out of the configured groups is no longer ours to remove.
  for (let pageNumber = 1; ; pageNumber++) {
    requireConfirmationTime(context);
    const members = await groupPage(client, config, candidate.groupId, pageNumber);
    if (members.some((runner) => runner.id === candidate.runnerId)) break;
    if (members.length < 100) return;
  }
  requireConfirmationTime(context);
  if (await provider.exists(candidate.resourceId)) return;
  requireConfirmationTime(context);
  let runner;
  try {
    runner = (
      await client.actions.getSelfHostedRunnerForOrg({
        org: config.organization,
        runner_id: candidate.runnerId,
      })
    ).data;
  } catch (error) {
    if (isNotFound(error)) return;
    throw error;
  }
  if (runner.name !== candidate.runnerName || runner.status !== 'offline' || runner.busy !== false) return;
  requireConfirmationTime(context);
  try {
    await client.actions.deleteSelfHostedRunnerFromOrg({ org: config.organization, runner_id: candidate.runnerId });
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  logger.info('Removed stale GitHub registration', { runnerId: candidate.runnerId, resourceId: candidate.resourceId });
}

export async function registrationJanitor(
  event: Partial<SQSEvent>,
  context: Context,
): Promise<SQSBatchResponse | void> {
  setContext(context, 'registration-janitor');
  const clients: InstallationClientCache = new Map();
  const config = loadConfig();
  const provider = createRegistrationCleanupProvider(config.computeProvider, config.runnerNamePrefix);
  if (event.Records) {
    const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];
    for (const record of event.Records) {
      try {
        requireConfirmationTime(context);
        const client = await createRunnerInstallationClient(config.organization, 'Org', config.ghesApiUrl, clients);
        await confirm(client, config, JSON.parse(record.body) as Candidate, context, provider);
      } catch (error) {
        logger.warn('Registration confirmation failed; leaving the runner registered', {
          error,
          messageId: record.messageId,
        });
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }
    return { batchItemFailures };
  }
  await discover(config, context, provider, clients);
}
