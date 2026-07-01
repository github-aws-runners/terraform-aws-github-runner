import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { WorkflowJobEvent } from '@octokit/webhooks-types';

import { Response } from '../lambda';
import { RunnerMatcherConfig, sendActionRequest } from '../sqs';
import ValidationError from '../ValidationError';
import { ConfigDispatcher, ConfigWebhook } from '../ConfigLoader';
import { violationsAgainstPolicy } from './dynamic-labels-policy';

const logger = createChildLogger('handler');

const GHR_LABEL_MAX_LENGTH = 128;
const GHR_LABEL_VALUE_PATTERN = /^[a-zA-Z0-9._/\-:]+$/;

export async function dispatch(
  event: WorkflowJobEvent,
  eventType: string,
  config: ConfigDispatcher | ConfigWebhook,
): Promise<Response> {
  validateRepoInAllowList(event, config);

  return await handleWorkflowJob(event, eventType, config.matcherConfig!);
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

  // Sort queues by priority (exactMatch first), as before.
  matcherConfig.sort((a, b) => {
    return a.matcherConfig.exactMatch === b.matcherConfig.exactMatch ? 0 : a.matcherConfig.exactMatch ? -1 : 1;
  });

  const allLabels = body.workflow_job.labels;
  const ghrLabels = allLabels.filter((l) => l.startsWith('ghr-'));
  const sanitizedGhrLabels = sanitizeGhrLabels(ghrLabels);
  const nonGhrLabels = allLabels.filter((l) => !l.startsWith('ghr-'));
  const hasDynamicLabels = sanitizedGhrLabels.length > 0;

  // 1. Collect all queues whose non-dynamic labels match the job.
  const matches: RunnerMatcherConfig[] = matcherConfig.filter((q) =>
    canRunJob(nonGhrLabels, q.matcherConfig.labelMatchers, q.matcherConfig.exactMatch),
  );

  if (matches.length === 0) {
    return notAccepted(body);
  }

  // 2. Pick a queue.
  let chosen: RunnerMatcherConfig;
  let labelsToSend: string[];

  if (!hasDynamicLabels) {
    // No dynamic labels in the job: take the first match, forward as-is.
    chosen = matches[0];
    labelsToSend = nonGhrLabels;
  } else {
    // Dynamic labels present: prefer the first match that has dynamic labels
    // enabled AND accepts these labels under its policy.
    let compliant: RunnerMatcherConfig | undefined;
    for (const q of matches) {
      if (!q.matcherConfig.enableDynamicLabels) {
        logger.warn(`Queue ${q.id} matches non-dynamic labels but does not allow dynamic labels; trying next match`);
        continue;
      }
      const violations = violationsAgainstPolicy(sanitizedGhrLabels, q.matcherConfig.ec2DynamicLabelsPolicy);
      if (violations.length === 0) {
        compliant = q;
        break;
      }
      for (const v of violations) {
        logger.warn(`Queue ${q.id}: dynamic label '${v.label}' does not match policy (${v.reason}); trying next match`);
      }
    }

    if (compliant) {
      chosen = compliant;
      labelsToSend = [...nonGhrLabels, ...sanitizedGhrLabels];
    } else {
      // No queue accepts the dynamic labels under its policy: refuse the job.
      logger.warn(`No queue accepts the dynamic labels for this job; not dispatching`, {
        dynamicLabels: sanitizedGhrLabels,
      });
      return notAccepted(body);
    }
  }

  await sendActionRequest({
    id: body.workflow_job.id,
    repositoryName: body.repository.name,
    repositoryOwner: body.repository.owner.login,
    eventType: githubEvent,
    installationId: body.installation?.id ?? 0,
    queueId: chosen.id,
    repoOwnerType: body.repository.owner.type,
    labels: labelsToSend,
  });

  logger.info(
    `Successfully dispatched job for ${body.repository.full_name} to the queue ${chosen.id} - ` +
      `Job ID: ${body.workflow_job.id}, Job Name: ${body.workflow_job.name}, Run ID: ${body.workflow_job.run_id}`,
  );
  return {
    statusCode: 201,
    body: `Successfully queued job for ${body.repository.full_name} to the queue ${chosen.id}`,
  };
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

function sanitizeGhrLabels(labels: string[]): string[] {
  return labels.filter((label) => {
    if (label.length > GHR_LABEL_MAX_LENGTH) {
      logger.warn('Dynamic label exceeds max length, stripping', { label: label.substring(0, 40) });
      return false;
    }
    if (!GHR_LABEL_VALUE_PATTERN.test(label)) {
      logger.warn('Dynamic label contains invalid characters, stripping', { label });
      return false;
    }
    return true;
  });
}

/**
 * Pure label match against a runner's `labelMatchers`. Caller is expected to
 * pass only non-dynamic labels.
 */
export function canRunJob(
  workflowJobLabels: string[],
  runnerLabelsMatchers: string[][],
  workflowLabelCheckAll: boolean,
): boolean {
  const lowered = runnerLabelsMatchers.map((rl) => rl.map((l) => l.toLowerCase()));
  const matchLabels = workflowLabelCheckAll
    ? lowered.some((rl) => workflowJobLabels.every((wl) => rl.includes(wl.toLowerCase())))
    : lowered.some((rl) => workflowJobLabels.some((wl) => rl.includes(wl.toLowerCase())));
  const match = workflowJobLabels.length === 0 ? !matchLabels : matchLabels;

  logger.debug(
    `Received workflow job event with labels: '${JSON.stringify(workflowJobLabels)}'. The event does ${
      match ? '' : 'NOT '
    }match the runner labels: '${Array.from(lowered).join(',')}'`,
  );
  return match;
}
