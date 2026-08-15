import { afterEach, describe, expect, it, vi } from 'vitest';

import { ScaleSetRequestError, ScaleSetRequestTimeoutError } from './errors';
import { createRetryingFetch, DEFAULT_SCALE_SET_RETRY_OPTIONS, resolveScaleSetRetryOptions } from './http';
import { ScaleSetFetch } from './types';

function okResponse(): Response {
  return new Response('{"ok":true}', { status: 200 });
}

describe('retrying fetch', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses bounded defaults close to the upstream client and validates overrides', () => {
    expect(resolveScaleSetRetryOptions()).toEqual({
      maxRetries: 4,
      initialBackoffMs: 1_000,
      maxBackoffMs: 30_000,
      requestTimeoutMs: 300_000,
    });
    expect(DEFAULT_SCALE_SET_RETRY_OPTIONS).toEqual(resolveScaleSetRetryOptions());
    expect(() => resolveScaleSetRetryOptions({ maxRetries: -1 })).toThrow(/retry\.maxRetries/);
    expect(() => resolveScaleSetRetryOptions({ maxRetries: 1.5 })).toThrow(/integer/);
    expect(() => resolveScaleSetRetryOptions({ requestTimeoutMs: 0 })).toThrow(/requestTimeoutMs/);
  });

  it('retries a network error after deterministic exponential backoff', async () => {
    vi.useFakeTimers();
    const underlyingFetch = vi
      .fn<ScaleSetFetch>()
      .mockRejectedValueOnce(new TypeError('socket closed'))
      .mockResolvedValueOnce(okResponse());
    const fetchWithRetry = createRetryingFetch(underlyingFetch, {
      maxRetries: 1,
      initialBackoffMs: 25,
      maxBackoffMs: 100,
      requestTimeoutMs: 1_000,
    });

    const request = fetchWithRetry('https://actions.example/test');
    await vi.advanceTimersByTimeAsync(24);
    expect(underlyingFetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);

    await expect(request).resolves.toMatchObject({ status: 200 });
    expect(underlyingFetch).toHaveBeenCalledTimes(2);
  });

  it('honors Retry-After for 429 responses and caps the wait at maxBackoffMs', async () => {
    vi.useFakeTimers();
    const underlyingFetch = vi
      .fn<ScaleSetFetch>()
      .mockResolvedValueOnce(
        new Response('{"message":"slow down"}', {
          status: 429,
          headers: { 'Retry-After': '120' },
        }),
      )
      .mockResolvedValueOnce(okResponse());
    const fetchWithRetry = createRetryingFetch(underlyingFetch, {
      maxRetries: 1,
      initialBackoffMs: 10,
      maxBackoffMs: 30_000,
      requestTimeoutMs: 1_000,
    });

    const request = fetchWithRetry('https://actions.example/test');
    await vi.advanceTimersByTimeAsync(29_999);
    expect(underlyingFetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);

    await expect(request).resolves.toMatchObject({ status: 200 });
    expect(underlyingFetch).toHaveBeenCalledTimes(2);
  });

  it('retries 5xx responses only up to maxRetries and returns the final response', async () => {
    vi.useFakeTimers();
    const underlyingFetch = vi.fn<ScaleSetFetch>(
      async () =>
        new Response('{"message":"unavailable"}', {
          status: 503,
          headers: { 'Retry-After': 'invalid' },
        }),
    );
    const fetchWithRetry = createRetryingFetch(underlyingFetch, {
      maxRetries: 2,
      initialBackoffMs: 10,
      maxBackoffMs: 15,
      requestTimeoutMs: 1_000,
    });

    const request = fetchWithRetry('https://actions.example/test');
    await vi.runAllTimersAsync();

    await expect(request).resolves.toMatchObject({ status: 503 });
    expect(underlyingFetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry a queue 401 so message-session refresh remains the owner', async () => {
    const underlyingFetch = vi.fn<ScaleSetFetch>(async () => new Response(null, { status: 401 }));
    const fetchWithRetry = createRetryingFetch(underlyingFetch, {
      maxRetries: 4,
      initialBackoffMs: 1,
      maxBackoffMs: 1,
      requestTimeoutMs: 100,
    });

    await expect(fetchWithRetry('https://queue.example/messages')).resolves.toMatchObject({ status: 401 });
    expect(underlyingFetch).toHaveBeenCalledOnce();
  });

  it('times out each attempt and stops after the configured retry bound', async () => {
    vi.useFakeTimers();
    const underlyingFetch = vi.fn<ScaleSetFetch>(() => new Promise<Response>(() => undefined));
    const fetchWithRetry = createRetryingFetch(underlyingFetch, {
      maxRetries: 1,
      initialBackoffMs: 10,
      maxBackoffMs: 10,
      requestTimeoutMs: 50,
    });

    const request = fetchWithRetry('https://actions.example/hangs');
    const rejection = expect(request).rejects.toMatchObject({
      name: 'ScaleSetRequestTimeoutError',
      attempts: 2,
      timeoutMs: 50,
    } satisfies Partial<ScaleSetRequestTimeoutError>);
    await vi.advanceTimersByTimeAsync(50);
    expect(underlyingFetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10);
    expect(underlyingFetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(50);

    await rejection;
  });

  it('interrupts retry backoff immediately when the caller aborts', async () => {
    vi.useFakeTimers();
    const underlyingFetch = vi.fn<ScaleSetFetch>(async () => new Response(null, { status: 503 }));
    const fetchWithRetry = createRetryingFetch(underlyingFetch, {
      maxRetries: 4,
      initialBackoffMs: 30_000,
      maxBackoffMs: 30_000,
      requestTimeoutMs: 60_000,
    });
    const controller = new AbortController();
    const request = fetchWithRetry('https://actions.example/test', { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);

    controller.abort(new Error('caller cancelled'));

    await expect(request).rejects.toThrow('caller cancelled');
    expect(underlyingFetch).toHaveBeenCalledOnce();
  });

  it('wraps an exhausted network failure with the final attempt count', async () => {
    vi.useFakeTimers();
    const underlyingFetch = vi.fn<ScaleSetFetch>(async () => {
      throw new TypeError('network unavailable');
    });
    const fetchWithRetry = createRetryingFetch(underlyingFetch, {
      maxRetries: 1,
      initialBackoffMs: 1,
      maxBackoffMs: 1,
      requestTimeoutMs: 100,
    });

    const request = fetchWithRetry('https://actions.example/test', { method: 'POST' });
    const rejection = expect(request).rejects.toMatchObject({
      name: 'ScaleSetRequestError',
      method: 'POST',
      attempts: 2,
    } satisfies Partial<ScaleSetRequestError>);
    await vi.runAllTimersAsync();

    await rejection;
  });
});
