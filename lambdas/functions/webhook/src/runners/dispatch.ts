import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { WorkflowJobEvent } from '@octokit/webhooks-types';

import { Response } from '../lambda';
import { RunnerMatcherConfig, sendActionRequest } from '../sqs';
import ValidationError from '../ValidationError';
import { ConfigDispatcher, ConfigWebhook } from '../ConfigLoader';

const logger = createChildLogger('handler');

export async function dispatch(
  event: WorkflowJobEvent,
  eventType: string,
  config: ConfigDispatcher | ConfigWebhook,
): Promise<Response> {
  validateRepoInAllowList(event, config);

  return await handleWorkflowJob(event, eventType, config.matcherConfig!, config.enableDynamicLabels);
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
  enableDynamicLabels: boolean,
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
  // sort the queuesConfig by order of matcher config exact match, with all true matches lined up ahead.
  matcherConfig.sort((a, b) => {
    return a.matcherConfig.exactMatch === b.matcherConfig.exactMatch ? 0 : a.matcherConfig.exactMatch ? -1 : 1;
  });
  for (const queue of matcherConfig) {
    if (
      canRunJob(
        body.workflow_job.labels,
        queue.matcherConfig.labelMatchers,
        queue.matcherConfig.exactMatch,
        enableDynamicLabels,
      )
    ) {
      await sendActionRequest({
        id: body.workflow_job.id,
        repositoryName: body.repository.name,
        repositoryOwner: body.repository.owner.login,
        eventType: githubEvent,
        installationId: body.installation?.id ?? 0,
        queueId: queue.id,
        repoOwnerType: body.repository.owner.type,
        labels: body.workflow_job.labels,
      });
      logger.info(
        `Successfully dispatched job for ${body.repository.full_name} to the queue ${queue.id} - ` +
          `Job ID: ${body.workflow_job.id}, Job Name: ${body.workflow_job.name}, Run ID: ${body.workflow_job.run_id}`,
      );
      return {
        statusCode: 201,
        body: `Successfully queued job for ${body.repository.full_name} to the queue ${queue.id}`,
      };
    }
  }
  const notAcceptedErrorMsg = `Received event contains runner labels '${body.workflow_job.labels}' from '${
    body.repository.full_name
  }' that are not accepted.`;
  logger.warn(
    `${notAcceptedErrorMsg} - Job ID: ${body.workflow_job.id}, Job Name: ${body.workflow_job.name}, Run ID: ${body.workflow_job.run_id}`,
  );
  return { statusCode: 202, body: notAcceptedErrorMsg };
}

function sanitizeGhrLabels(labels: string[]): string[] {
  const GHR_LABEL_MAX_LENGTH = 128;
  const GHR_LABEL_VALUE_PATTERN = /^[a-zA-Z0-9._/\-:]+$/;

  return labels
    .map((label) => {
      if (!label.startsWith('ghr-')) return label;

      if (label.length > GHR_LABEL_MAX_LENGTH) {
        logger.warn('Dynamic label exceeds max length, stripping', { label: label.substring(0, 40) });
        return null;
      }
      if (!GHR_LABEL_VALUE_PATTERN.test(label)) {
        logger.warn('Dynamic label contains invalid characters, stripping', { label });
        return null;
      }
      return null;
    })
    .filter((l): l is string => l !== null);
}

export function canRunJob(
  workflowJobLabels: string[],
  runnerLabelsMatchers: string[][],
  workflowLabelCheckAll: boolean,
  enableDynamicLabels: boolean,
): boolean {
  // Filter out ghr- labels only and sanitize them if dynamic labels is enabled, otherwise keep all labels as is for matching.
  const sanitizedLabels = enableDynamicLabels ? sanitizeGhrLabels(workflowJobLabels) : workflowJobLabels;

  runnerLabelsMatchers = runnerLabelsMatchers.map((runnerLabel) => {
    return runnerLabel.map((label) => label.toLowerCase());
  });
  const matchLabels = workflowLabelCheckAll
    ? runnerLabelsMatchers.some((rl) => sanitizedLabels.every((wl) => rl.includes(wl.toLowerCase())))
    : runnerLabelsMatchers.some((rl) => sanitizedLabels.some((wl) => rl.includes(wl.toLowerCase())));
  const match = sanitizedLabels.length === 0 ? !matchLabels : matchLabels;

  logger.debug(
    `Received workflow job event with labels: '${JSON.stringify(workflowJobLabels)}'. The event does ${
      match ? '' : 'NOT '
    }match the runner labels: '${Array.from(runnerLabelsMatchers).join(',')}'`,
  );
  return match;
}
