import {
  ScaleSetErrorCode,
  ScaleSetHttpError,
  ScaleSetProtocolError,
  ScaleSetRequestError,
  ScaleSetRequestTimeoutError,
  redactUrlForError,
} from './errors';
import { ScaleSetFetch, ScaleSetRetryOptions } from './types';

export interface ResolvedScaleSetRetryOptions {
  maxRetries: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  requestTimeoutMs: number;
}

export const DEFAULT_SCALE_SET_RETRY_OPTIONS: Readonly<ResolvedScaleSetRetryOptions> = Object.freeze({
  maxRetries: 4,
  initialBackoffMs: 1_000,
  maxBackoffMs: 30_000,
  requestTimeoutMs: 5 * 60_000,
});

export interface HttpResult {
  response: Response;
  body: string;
}

interface RetryingFetchPolicy {
  additionalRetryStatuses?: readonly number[];
  /**
   * Escape hatch for a known-safe, operation-scoped wrapper. Non-idempotent
   * methods are never retried by the default transport policy.
   */
  additionalRetryMethods?: readonly string[];
}

const MAX_RESPONSE_BODY_BYTES = 1024 * 1024;
const IDEMPOTENT_RETRY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

function trimByteOrderMark(body: string): string {
  return body.startsWith('\uFEFF') ? body.slice(1) : body;
}

function boundedNumber(name: string, value: number, minimum: number, integer: boolean): number {
  if (!Number.isFinite(value) || value < minimum || (integer && !Number.isInteger(value))) {
    throw new TypeError(`${name} must be ${integer ? 'an integer' : 'a number'} greater than or equal to ${minimum}`);
  }
  return value;
}

export function resolveScaleSetRetryOptions(options: ScaleSetRetryOptions = {}): ResolvedScaleSetRetryOptions {
  return {
    maxRetries: boundedNumber(
      'retry.maxRetries',
      options.maxRetries ?? DEFAULT_SCALE_SET_RETRY_OPTIONS.maxRetries,
      0,
      true,
    ),
    initialBackoffMs: boundedNumber(
      'retry.initialBackoffMs',
      options.initialBackoffMs ?? DEFAULT_SCALE_SET_RETRY_OPTIONS.initialBackoffMs,
      0,
      false,
    ),
    maxBackoffMs: boundedNumber(
      'retry.maxBackoffMs',
      options.maxBackoffMs ?? DEFAULT_SCALE_SET_RETRY_OPTIONS.maxBackoffMs,
      0,
      false,
    ),
    requestTimeoutMs: boundedNumber(
      'retry.requestTimeoutMs',
      options.requestTimeoutMs ?? DEFAULT_SCALE_SET_RETRY_OPTIONS.requestTimeoutMs,
      1,
      false,
    ),
  };
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(abortReason(signal));
  }
  if (delayMs === 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(abortReason(signal as AbortSignal));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function retryableStatus(status: number, additionalRetryStatuses: ReadonlySet<number>): boolean {
  return status === 429 || (status >= 500 && status <= 599) || additionalRetryStatuses.has(status);
}

function requestMethod(input: RequestInput, init: RequestInit): string {
  return (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
}

function exponentialBackoffMs(retryIndex: number, options: ResolvedScaleSetRetryOptions): number {
  return Math.min(options.initialBackoffMs * 2 ** retryIndex, options.maxBackoffMs);
}

function retryAfterMs(response: Response, options: ResolvedScaleSetRetryOptions): number | undefined {
  const value = response.headers.get('Retry-After')?.trim();
  if (!value) {
    return undefined;
  }

  let delayMs: number;
  if (/^\d+$/.test(value)) {
    delayMs = Number(value) * 1_000;
  } else {
    const retryAt = Date.parse(value);
    if (!Number.isFinite(retryAt)) {
      return undefined;
    }
    delayMs = Math.max(0, retryAt - Date.now());
  }
  return Math.min(delayMs, options.maxBackoffMs);
}

async function fetchAttempt(
  fetchImplementation: ScaleSetFetch,
  input: RequestInput,
  init: RequestInit,
  options: ResolvedScaleSetRetryOptions,
  attempt: number,
): Promise<Response> {
  const method = requestMethod(input, init);
  const url = input instanceof Request ? input.url : input.toString();
  const callerSignal = init.signal ?? undefined;
  if (callerSignal?.aborted) {
    throw abortReason(callerSignal);
  }

  const attemptController = new AbortController();
  const forwardAbort = () => attemptController.abort(abortReason(callerSignal as AbortSignal));
  callerSignal?.addEventListener('abort', forwardAbort, { once: true });
  const timeoutError = new ScaleSetRequestTimeoutError(method, url, options.requestTimeoutMs, attempt);
  const timeout = setTimeout(() => attemptController.abort(timeoutError), options.requestTimeoutMs);

  let onAttemptAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAttemptAbort = () => reject(abortReason(attemptController.signal));
    attemptController.signal.addEventListener('abort', onAttemptAbort, { once: true });
  });

  try {
    return await Promise.race([fetchImplementation(input, { ...init, signal: attemptController.signal }), aborted]);
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener('abort', forwardAbort);
    if (onAttemptAbort !== undefined) {
      attemptController.signal.removeEventListener('abort', onAttemptAbort);
    }
  }
}

type RequestInput = Parameters<ScaleSetFetch>[0];

/** Wrap native fetch with the bounded retry and timeout policy used by every SDK request. */
export function createRetryingFetch(
  fetchImplementation: ScaleSetFetch,
  retryOptions: ScaleSetRetryOptions = {},
  policy: RetryingFetchPolicy = {},
): ScaleSetFetch {
  const options = resolveScaleSetRetryOptions(retryOptions);
  const additionalRetryStatusSet = new Set(policy.additionalRetryStatuses ?? []);
  const additionalRetryMethodSet = new Set((policy.additionalRetryMethods ?? []).map((method) => method.toUpperCase()));

  return async (input, init = {}) => {
    const method = requestMethod(input, init);
    const url = input instanceof Request ? input.url : input.toString();
    const maxRetries =
      IDEMPOTENT_RETRY_METHODS.has(method) || additionalRetryMethodSet.has(method) ? options.maxRetries : 0;

    for (let retryIndex = 0; retryIndex <= maxRetries; retryIndex += 1) {
      const attempt = retryIndex + 1;
      try {
        const response = await fetchAttempt(fetchImplementation, input, init, options, attempt);
        if (!retryableStatus(response.status, additionalRetryStatusSet) || retryIndex === maxRetries) {
          return response;
        }

        const delayMs = retryAfterMs(response, options) ?? exponentialBackoffMs(retryIndex, options);
        await response.body?.cancel().catch(() => undefined);
        await waitForRetry(delayMs, init.signal ?? undefined);
      } catch (error) {
        if (init.signal?.aborted) {
          throw abortReason(init.signal);
        }
        if (retryIndex === maxRetries) {
          if (error instanceof ScaleSetRequestTimeoutError) {
            throw error;
          }
          throw new ScaleSetRequestError(method, url, error, attempt);
        }
        await waitForRetry(exponentialBackoffMs(retryIndex, options), init.signal ?? undefined);
      }
    }

    throw new ScaleSetRequestError(method, url, new Error('retry loop exhausted'), maxRetries + 1);
  };
}

export async function executeRequest(
  fetchImplementation: ScaleSetFetch,
  url: string | URL,
  init: RequestInit,
  expectedStatuses: readonly number[],
  errorCode?: ScaleSetErrorCode | ((response: Response) => ScaleSetErrorCode | undefined),
): Promise<HttpResult> {
  const method = init.method ?? 'GET';
  const urlString = url.toString();
  const displayUrl = redactUrlForError(urlString);
  let response: Response;

  try {
    response = await fetchImplementation(url, { ...init, redirect: 'error' });
  } catch (error) {
    if (init.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw error;
    }
    if (error instanceof ScaleSetRequestError) {
      throw error;
    }
    throw new ScaleSetRequestError(method, urlString, error);
  }

  let body: string;
  try {
    const contentLength = response.headers.get('content-length');
    if (contentLength !== null && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_RESPONSE_BODY_BYTES) {
      throw new ScaleSetProtocolError(
        `response body from ${method} ${displayUrl} exceeds ${MAX_RESPONSE_BODY_BYTES} bytes`,
        {
          method,
          url: displayUrl,
        },
      );
    }
    if (response.body === null) {
      body = '';
    } else {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_RESPONSE_BODY_BYTES) {
          await reader.cancel().catch(() => undefined);
          throw new ScaleSetProtocolError(
            `response body from ${method} ${displayUrl} exceeds ${MAX_RESPONSE_BODY_BYTES} bytes`,
            { method, url: displayUrl },
          );
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      body = trimByteOrderMark(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    }
  } catch (error) {
    if (error instanceof ScaleSetProtocolError) throw error;
    throw new ScaleSetProtocolError(`failed to read the response body from ${method} ${displayUrl}`, {
      method,
      url: displayUrl,
      cause: error,
    });
  }

  if (!expectedStatuses.includes(response.status)) {
    throw new ScaleSetHttpError({
      method,
      url: displayUrl,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      responseBody: body,
      code: typeof errorCode === 'function' ? errorCode(response) : errorCode,
    });
  }

  return { response, body };
}

export function parseJsonResponse<T>(result: HttpResult, method: string, url: string | URL): T {
  const urlString = redactUrlForError(url.toString());
  if (result.body === '') {
    throw new ScaleSetProtocolError(`empty JSON response from ${method} ${urlString}`, {
      method,
      url: urlString,
    });
  }

  try {
    return JSON.parse(result.body) as T;
  } catch (error) {
    throw new ScaleSetProtocolError(`invalid JSON response from ${method} ${urlString}`, {
      method,
      url: urlString,
      cause: error,
    });
  }
}
