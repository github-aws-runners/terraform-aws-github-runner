import { tracer } from '@aws-github-runner/aws-powertools-util';
import { APIGatewayEvent, Context } from 'aws-lambda';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { githubEventTracingMiddleware } from './githubEventTracingMiddleware';

describe('githubEventTracingMiddleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function buildEvent(overrides: Partial<APIGatewayEvent> = {}): APIGatewayEvent {
    return {
      headers: {
        'X-GitHub-Event': 'workflow_job',
        'X-GitHub-Delivery': 'delivery-id-1',
      },
      body: JSON.stringify({ workflow_job: { created_at: new Date(Date.now() - 5000).toISOString() } }),
      requestContext: { requestTimeEpoch: Date.now() - 20 },
      ...overrides,
    } as unknown as APIGatewayEvent;
  }

  it('does nothing when tracing is not enabled (no active segment)', async () => {
    vi.spyOn(tracer, 'getSegment').mockReturnValue(undefined);
    const putAnnotation = vi.spyOn(tracer, 'putAnnotation');

    const { before, after } = githubEventTracingMiddleware();
    await before?.({ event: buildEvent(), context: {} as Context } as never);
    await after?.({ event: buildEvent(), context: {} as Context } as never);

    expect(putAnnotation).not.toHaveBeenCalled();
  });

  it('annotates event type, delivery id, ingress lag and workflow_job age when tracing is active', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(tracer, 'getSegment').mockReturnValue({} as any);
    const putAnnotation = vi.spyOn(tracer, 'putAnnotation').mockImplementation(() => undefined);

    const { before } = githubEventTracingMiddleware();
    await before?.({ event: buildEvent(), context: {} as Context } as never);

    expect(putAnnotation).toHaveBeenCalledWith('github_event_type', 'workflow_job');
    expect(putAnnotation).toHaveBeenCalledWith('github_delivery_id', 'delivery-id-1');
    expect(putAnnotation).toHaveBeenCalledWith('api_gateway_ingress_to_lambda_ms', expect.any(Number));
    expect(putAnnotation).toHaveBeenCalledWith('workflow_job_age_ms', expect.any(Number));
  });

  it('skips workflow_job_age_ms for non workflow_job event types', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(tracer, 'getSegment').mockReturnValue({} as any);
    const putAnnotation = vi.spyOn(tracer, 'putAnnotation').mockImplementation(() => undefined);

    const { before } = githubEventTracingMiddleware();
    await before?.({
      event: buildEvent({ headers: { 'X-GitHub-Event': 'push', 'X-GitHub-Delivery': 'delivery-id-2' } }),
      context: {} as Context,
    } as never);

    expect(putAnnotation).toHaveBeenCalledWith('github_event_type', 'push');
    expect(putAnnotation).not.toHaveBeenCalledWith('workflow_job_age_ms', expect.any(Number));
  });

  it('does not throw on a malformed body and skips the age annotation', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(tracer, 'getSegment').mockReturnValue({} as any);
    const putAnnotation = vi.spyOn(tracer, 'putAnnotation').mockImplementation(() => undefined);

    const { before } = githubEventTracingMiddleware();
    await before?.({ event: buildEvent({ body: 'not-json' }), context: {} as Context } as never);

    expect(putAnnotation).not.toHaveBeenCalledWith('workflow_job_age_ms', expect.any(Number));
  });

  it('adds lambda_processing_ms annotation on after and onError', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(tracer, 'getSegment').mockReturnValue({} as any);
    const putAnnotation = vi.spyOn(tracer, 'putAnnotation').mockImplementation(() => undefined);

    const middleware = githubEventTracingMiddleware();
    await middleware.before?.({ event: buildEvent(), context: {} as Context } as never);
    await middleware.after?.({ event: buildEvent(), context: {} as Context } as never);

    expect(putAnnotation).toHaveBeenCalledWith('lambda_processing_ms', expect.any(Number));
  });
});
