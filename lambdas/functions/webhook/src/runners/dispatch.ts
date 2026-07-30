import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { WorkflowJobEvent } from '@octokit/webhooks-types';

import { Response } from '../lambda';
import { RunnerMatcherConfig, sendActionRequest } from '../sqs';
import ValidationError from '../ValidationError';
import { ConfigDispatcher, ConfigWebhook, QueueSelectionStrategy } from '../ConfigLoader';
import { selectAwsDynamicLabelQueue } from './aws-dynamic-labels';
import { canRunJob, splitWorkflowJobLabels } from './labels';

const logger = createChildLogger('handler');

export async function dispatch(
  event: WorkflowJobEvent,
  eventType: string,
  config: ConfigDispatcher | ConfigWebhook,
): Promise<Response> {
  validateRepoInAllowList(event, config);

  return await handleWorkflowJob(event, eventType, config.matcherConfig!, config.queueSelectionStrategy);
}

function validateRepoInAllowList(event: WorkflowJobEvent, config: ConfigDispatcher) {
  if (config.repositoryAllowList.length > 0 && !config.repositoryAllowList.includes(event.repository.full_name)) {
    logger.info(`Received event from unauthorized repository ${event.repository.full_name}`);
    throw new ValidationError(403, `Received event from unauthorized repository ${event.repository.full_name}`);
  }
}

async function handleWorkflowJob(
  body: WorkflowJobEvent,
  githubEvent: string,
  matcherConfig: Array<RunnerMatcherConfig>,
  queueSelectionStrategy: QueueSelectionStrategy = 'first',
): Promise<Response> {
  if (body.action !== 'queued') {
    return {
      statusCode: 201,
      body: `Workflow job not queued, not dispatching to queue.`,
    };
  }

  logger.debug(
    `Processing workflow job event - Repository: ${body.repository.full_name}, ` +
      `Job ID: ${body.workflow_job.id}, Job Name: ${body.workflow_job.name}, ` +
      `Run ID: ${body.workflow_job.run_id}, Labels: ${JSON.stringify(body.workflow_job.labels)}`,
  );

  // Sort queues by priority (exact/bidirectional match first), as before.
  matcherConfig.sort((a, b) => {
    const aStrict = a.matcherConfig.bidirectionalLabelMatch || a.matcherConfig.exactMatch;
    const bStrict = b.matcherConfig.bidirectionalLabelMatch || b.matcherConfig.exactMatch;
    return aStrict === bStrict ? 0 : aStrict ? -1 : 1;
  });

  const { nonGhrLabels, sanitizedGhrLabels, hasDynamicLabels } = splitWorkflowJobLabels(body.workflow_job.labels);

  // 1. Collect all queues whose non-dynamic labels match the job.
  const matches: RunnerMatcherConfig[] = matcherConfig.filter((q) =>
    canRunJob(
      nonGhrLabels,
      q.matcherConfig.labelMatchers,
      q.matcherConfig.exactMatch,
      q.matcherConfig.bidirectionalLabelMatch,
    ),
  );

  if (matches.length === 0) {
    return notAccepted(body);
  }

  // 2. Pick the target queue(s).
  let targets: RunnerMatcherConfig[];
  let labelsToSend: string[];

  if (!hasDynamicLabels) {
    // No dynamic labels in the job: select among the equally-best matches (those
    // sharing the top priority, i.e. the same exactMatch as the first match)
    // according to the configured strategy, and forward as-is.
    const topMatches = matches.filter((q) => q.matcherConfig.exactMatch === matches[0].matcherConfig.exactMatch);
    targets = selectQueues(topMatches, queueSelectionStrategy);
    labelsToSend = nonGhrLabels;
  } else {
    // Dynamic labels present: prefer the first provider-compliant queue. The
    // queue selection strategy applies to standard jobs only; dynamic-label jobs
    // always use the first compliant queue.
    const dynamicTarget = selectAwsDynamicLabelQueue(matches, nonGhrLabels, sanitizedGhrLabels);

    if (dynamicTarget) {
      targets = [dynamicTarget.queue];
      labelsToSend = dynamicTarget.labels;
    } else {
      // No queue accepts the dynamic labels under its policy: refuse the job.
      logger.warn(`No queue accepts the dynamic labels for this job; not dispatching`, {
        dynamicLabels: sanitizedGhrLabels,
      });
      return notAccepted(body);
    }
  }

  await Promise.all(
    targets.map((queue) =>
      sendActionRequest({
        id: body.workflow_job.id,
        repositoryName: body.repository.name,
        repositoryOwner: body.repository.owner.login,
        eventType: githubEvent,
        installationId: body.installation?.id ?? 0,
        queueId: queue.id,
        repoOwnerType: body.repository.owner.type,
        labels: labelsToSend,
      }),
    ),
  );

  const queueIds = targets.map((q) => q.id).join(', ');
  logger.info(
    `Successfully dispatched job for ${body.repository.full_name} to the queue(s) ${queueIds} - ` +
      `Job ID: ${body.workflow_job.id}, Job Name: ${body.workflow_job.name}, Run ID: ${body.workflow_job.run_id}`,
  );
  return {
    statusCode: 201,
    body: `Successfully queued job for ${body.repository.full_name} to the queue(s) ${queueIds}`,
  };
}

/**
 * Select the target queue(s) from a set of equally-matching candidates.
 * - 'first'  keeps the historical deterministic choice (the first candidate).
 * - 'random' picks one uniformly random candidate, spreading jobs across queues
 *   so a single pool's queue does not become a bottleneck.
 * - 'all'    returns every candidate, scaling up one runner per matching pool and
 *   letting the first to become available take the job (speed over cost). Note
 *   this multiplies AWS launches and runner registrations per job.
 */
function selectQueues(candidates: RunnerMatcherConfig[], strategy: QueueSelectionStrategy): RunnerMatcherConfig[] {
  switch (strategy) {
    case 'all':
      return candidates;
    case 'random':
      return [candidates[Math.floor(Math.random() * candidates.length)]];
    default:
      return [candidates[0]];
  }
}

function notAccepted(body: WorkflowJobEvent): Response {
  const notAcceptedErrorMsg = `Received event contains runner labels '${body.workflow_job.labels}' from '${
    body.repository.full_name
  }' that are not accepted.`;
  logger.warn(
    `${notAcceptedErrorMsg} - Job ID: ${body.workflow_job.id}, Job Name: ${body.workflow_job.name}, Run ID: ${body.workflow_job.run_id}`,
  );
  return { statusCode: 202, body: notAcceptedErrorMsg };
}
