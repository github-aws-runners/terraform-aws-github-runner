import { MiddlewareObj } from '@middy/core';
import { APIGatewayEvent, Context } from 'aws-lambda';
import { tracer } from '@aws-github-runner/aws-powertools-util';

// Reusable X-Ray instrumentation for the webhook Lambda's GitHub-originated event types.
// Adds annotations (queryable/alertable) rather than synthetic subsegments, so it never
// alters the shape of the actual X-Ray trace for this invocation.
export function githubEventTracingMiddleware<TResult = unknown>(): MiddlewareObj<APIGatewayEvent, TResult> {
  let lambdaStartedAt: number;

  const before = (request: { event: APIGatewayEvent; context: Context }): void => {
    lambdaStartedAt = Date.now();

    if (!tracer.getSegment()) return;

    const headers = lowerCaseKeys(request.event.headers as Record<string, string | undefined>);
    const eventType = headers['x-github-event'];
    const deliveryId = headers['x-github-delivery'];

    if (eventType !== undefined) tracer.putAnnotation('github_event_type', eventType);
    if (deliveryId !== undefined) tracer.putAnnotation('github_delivery_id', deliveryId);

    const apiGatewayIngressAtMs = request.event.requestContext?.requestTimeEpoch;
    if (apiGatewayIngressAtMs !== undefined) {
      tracer.putAnnotation('api_gateway_ingress_to_lambda_ms', lambdaStartedAt - apiGatewayIngressAtMs);
    }

    if (eventType === 'workflow_job') {
      const workflowJobAgeMs = tryGetWorkflowJobAgeMs(request.event.body, lambdaStartedAt);
      if (workflowJobAgeMs !== undefined) {
        tracer.putAnnotation('workflow_job_age_ms', workflowJobAgeMs);
      }
    }
  };

  const after = (): void => {
    if (!tracer.getSegment()) return;
    tracer.putAnnotation('lambda_processing_ms', Date.now() - lambdaStartedAt);
  };

  return { before, after, onError: after };
}

function lowerCaseKeys(headers: Record<string, string | undefined>): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const key in headers) {
    result[key.toLowerCase()] = headers[key];
  }
  return result;
}

// Best-effort: the body isn't verified/parsed yet at this point in the request lifecycle,
// so a malformed or not-yet-signature-verified payload must not fail the request.
function tryGetWorkflowJobAgeMs(body: string | null, nowMs: number): number | undefined {
  if (!body) return undefined;
  try {
    const createdAt = (JSON.parse(body) as { workflow_job?: { created_at?: string } }).workflow_job?.created_at;
    return createdAt ? nowMs - new Date(createdAt).getTime() : undefined;
  } catch {
    return undefined;
  }
}
