import { Webhooks } from '@octokit/webhooks';
import { WorkflowJobEvent } from '@octokit/webhooks-types';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { IncomingHttpHeaders } from 'http';

import { Response } from '../lambda';
import ValidationError from '../ValidationError';
import { dispatch } from '../runners/dispatch';
import { publish } from '../eventbridge';
import { ConfigWebhook, ConfigWebhookEventBridge } from '../ConfigLoader';
const logger = createChildLogger('handler');

export async function publishForRunners(
  headers: IncomingHttpHeaders,
  body: string,
  config: ConfigWebhook,
): Promise<Response> {
  init(headers);

  await verifySignature(headers, body, config.webhookSecret);

  const checkBodySizeResult = checkBodySize(body, headers);

  const { event, eventType } = readEvent(headers, body);
  logger.info(`Github event ${event.action} accepted for ${event.repository.full_name}`);
  if (checkBodySizeResult.sizeExceeded) {
    // We only warn for large event, when moving the event bridge we can only can accept events up to 256KB
    logger.warn('Body size exceeded 256KB', { size: checkBodySizeResult.message.size });
  }
  return await dispatch(event, eventType, config);
}

export async function publishOnEventBridge(
  headers: IncomingHttpHeaders,
  body: string,
  config: ConfigWebhookEventBridge,
): Promise<Response> {
  init(headers);

  await verifySignature(headers, body, config.webhookSecret);

  const eventType = headers['x-github-event'] as string;
  checkEventIsSupported(eventType, config.allowedEvents);

  const checkBodySizeResult = checkBodySize(body, headers);

  logger.info(
    `Github event ${headers['x-github-event'] as string} accepted for ` +
      `${headers['x-github-hook-installation-target-id'] as string}`,
  );

  let response: Response = { body: '', statusCode: 201 };
  if (!checkBodySizeResult.sizeExceeded) {
    await publishEvent(config.eventBusName, `github`, eventType, body);
    response = {
      statusCode: 201,
      body: `Event sent successfully to the EventBridge.`,
    };
  } else {
    await publishEvent(config.eventBusName, 'runners.webhook', `error.${eventType}`, checkBodySizeResult.message);
    logger.warn('Github event body size exceeded 256KB');
    response = { statusCode: 400, body: checkBodySizeResult.message.error };
  }
  return response;
}

async function publishEvent(eventBusName: string | undefined, eventSource: string, eventType: string, body: string) {
  try {
    const result = await publish({
      EventBusName: eventBusName,
      Source: eventSource,
      DetailType: eventType,
      Detail: body,
    });
    logger.debug(`Event sent to EventBridge`, {
      message: {
        Source: eventSource,
        DetailType: eventType,
        Detail: body,
      },
      result: result,
    });
  } catch (e) {
    logger.warn(`Failed to send event to EventBridge`, { error: e });
    throw e;
  }
}

async function verifySignature(headers: IncomingHttpHeaders, body: string, secret: string): Promise<number> {
  const signature = headers['x-hub-signature-256'] as string;
  const webhooks = new Webhooks({
    secret,
  });

  if (
    await webhooks.verify(body, signature).catch((e) => {
      logger.debug('Unable to verify signature!', { e });
      throw new ValidationError(500, 'Unable to verify signature!', e as Error);
    })
  ) {
    return 200;
  } else {
    logger.debug('Unable to verify signature!', { signature, body });
    throw new ValidationError(401, 'Unable to verify signature!');
  }
}

function init(headers: IncomingHttpHeaders) {
  for (const key in headers) {
    headers[key.toLowerCase()] = headers[key];
  }

  logger.appendPersistentKeys({
    github: {
      'github-delivery': headers['x-github-delivery'],
      'github-event': headers['x-github-event'],
      'github-hook-id': headers['x-github-hook-id'],
      'github-hook-installation-target-id': headers['x-github-hook-installation-target-id'],
    },
  });
}

function checkEventIsSupported(eventType: string, allowedEvents: string[]): void {
  if (allowedEvents.length > 0 && !allowedEvents.includes(eventType)) {
    logger.warn(`Unsupported event type: ${eventType}`);
    throw new ValidationError(202, `Unsupported event type: ${eventType}`);
  }
}

function readEvent(headers: IncomingHttpHeaders, body: string): { event: WorkflowJobEvent; eventType: string } {
  const eventType = headers['x-github-event'] as string;
  checkEventIsSupported(eventType, ['workflow_job']);

  const event = JSON.parse(body) as WorkflowJobEvent;
  logger.appendPersistentKeys({
    github: {
      repository: event.repository.full_name,
      action: event.action,
      name: event.workflow_job.name,
      status: event.workflow_job.status,
      workflowJobId: event.workflow_job.id,
      started_at: event.workflow_job.started_at,
      completed_at: event.workflow_job.completed_at,
      conclusion: event.workflow_job.conclusion,
    },
  });

  return { event, eventType };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function checkBodySize(body: string, headers: IncomingHttpHeaders): { sizeExceeded: boolean; message: any } {
  // GitHub does not specify if the content length is always present, fallback to the body size calculation.
  const contentLength = Number(headers['content-length']) || Buffer.byteLength(body, 'utf8');
  const bodySizeInKiloBytes = contentLength / 1024;

  return bodySizeInKiloBytes > 256
    ? {
        sizeExceeded: true,
        message: {
          error: 'Body size exceeded 256KB',
          size: bodySizeInKiloBytes,
        },
      }
    : {
        sizeExceeded: false,
        message: undefined,
      };
}
