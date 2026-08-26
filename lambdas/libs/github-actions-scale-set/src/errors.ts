export const SCALE_SET_ERROR_CODES = {
  badRequest: 'BAD_REQUEST',
  conflict: 'CONFLICT',
  jobStillRunning: 'JOB_STILL_RUNNING',
  messageQueueTokenExpired: 'MESSAGE_QUEUE_TOKEN_EXPIRED',
  notFound: 'NOT_FOUND',
  runnerExists: 'RUNNER_EXISTS',
  runnerNotFound: 'RUNNER_NOT_FOUND',
  unauthorized: 'UNAUTHORIZED',
  unexpectedStatus: 'UNEXPECTED_STATUS',
} as const;

export type ScaleSetErrorCode = (typeof SCALE_SET_ERROR_CODES)[keyof typeof SCALE_SET_ERROR_CODES];

export interface ScaleSetHttpErrorDetails {
  method: string;
  url: string;
  status: number;
  statusText: string;
  headers: Headers;
  responseBody: string;
  code?: ScaleSetErrorCode;
  cause?: unknown;
}

interface ActionsException {
  typeName?: unknown;
  message?: unknown;
}

export function redactUrlForError(value: string): string {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '<invalid-url>';
  }
}

function statusErrorCode(status: number): ScaleSetErrorCode {
  switch (status) {
    case 400:
      return SCALE_SET_ERROR_CODES.badRequest;
    case 401:
      return SCALE_SET_ERROR_CODES.unauthorized;
    case 404:
      return SCALE_SET_ERROR_CODES.notFound;
    case 409:
      return SCALE_SET_ERROR_CODES.conflict;
    default:
      return SCALE_SET_ERROR_CODES.unexpectedStatus;
  }
}

function exceptionErrorCode(typeName?: string): ScaleSetErrorCode | undefined {
  if (typeName?.includes('AgentExistsException')) {
    return SCALE_SET_ERROR_CODES.runnerExists;
  }
  if (typeName?.includes('AgentNotFoundException')) {
    return SCALE_SET_ERROR_CODES.runnerNotFound;
  }
  if (typeName?.includes('JobStillRunningException')) {
    return SCALE_SET_ERROR_CODES.jobStillRunning;
  }
  return undefined;
}

function parseActionsException(responseBody: string): { typeName?: string; message?: string } {
  if (responseBody === '') {
    return {};
  }

  try {
    const parsed = JSON.parse(responseBody) as ActionsException;
    return {
      typeName: typeof parsed.typeName === 'string' ? parsed.typeName : undefined,
      message: typeof parsed.message === 'string' ? parsed.message : undefined,
    };
  } catch {
    return {};
  }
}

/** An unsuccessful HTTP response from either GitHub or the Actions service. */
export class ScaleSetHttpError extends Error {
  readonly code: ScaleSetErrorCode;
  readonly status: number;
  readonly statusText: string;
  readonly method: string;
  readonly url: string;
  readonly activityId?: string;
  readonly githubRequestId?: string;
  readonly exceptionName?: string;
  readonly responseBody: string;

  constructor(details: ScaleSetHttpErrorDetails) {
    const safeUrl = redactUrlForError(details.url);
    const exception = parseActionsException(details.responseBody);
    const activityId = details.headers.get('ActivityId') ?? undefined;
    const githubRequestId = details.headers.get('X-GitHub-Request-Id') ?? undefined;
    const responseDescription = [details.status, details.statusText].filter(Boolean).join(' ');
    const metadata = [
      `status=${JSON.stringify(responseDescription)}`,
      activityId ? `activity_id=${JSON.stringify(activityId)}` : undefined,
      githubRequestId ? `github_request_id=${JSON.stringify(githubRequestId)}` : undefined,
    ]
      .filter((part): part is string => part !== undefined)
      .join(', ');
    const responseMessage = exception.message ?? (details.responseBody || 'unknown error');
    const exceptionPrefix = exception.typeName ? `${exception.typeName}: ` : '';

    super(`request ${details.method} ${safeUrl} failed (${metadata}): ${exceptionPrefix}${responseMessage}`, {
      cause: details.cause,
    });
    this.name = 'ScaleSetHttpError';
    this.code = details.code ?? exceptionErrorCode(exception.typeName) ?? statusErrorCode(details.status);
    this.status = details.status;
    this.statusText = details.statusText;
    this.method = details.method;
    this.url = safeUrl;
    this.activityId = activityId;
    this.githubRequestId = githubRequestId;
    this.exceptionName = exception.typeName;
    this.responseBody = details.responseBody;
  }
}

export class ScaleSetRequestError extends Error {
  readonly method: string;
  readonly url: string;
  readonly attempts: number;

  constructor(method: string, url: string, cause: unknown, attempts = 1) {
    const safeUrl = redactUrlForError(url);
    super(`request ${method} ${safeUrl} failed before receiving a response after ${attempts} attempt(s)`, { cause });
    this.name = 'ScaleSetRequestError';
    this.method = method;
    this.url = safeUrl;
    this.attempts = attempts;
  }
}

export class ScaleSetRequestTimeoutError extends ScaleSetRequestError {
  readonly timeoutMs: number;

  constructor(method: string, url: string, timeoutMs: number, attempts: number) {
    super(method, url, new Error(`request attempt exceeded ${timeoutMs}ms`), attempts);
    this.name = 'ScaleSetRequestTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class ScaleSetProtocolError extends Error {
  readonly method?: string;
  readonly url?: string;

  constructor(message: string, options: { method?: string; url?: string; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = 'ScaleSetProtocolError';
    this.method = options.method;
    this.url = options.url;
  }
}

export function isScaleSetHttpError(error: unknown): error is ScaleSetHttpError {
  return error instanceof ScaleSetHttpError;
}
