const REDACTED = '[REDACTED]';
const SENSITIVE_KEY = /(authorization|credential|encodedjit|jitconfig|password|private.?key|secret|sessionid|token)/i;
const SAFE_ERROR_MESSAGE_NAMES = new Set(['ScaleSetConfigurationError']);
const MAX_LOG_STRING_LENGTH = 1024;
const MAX_LOG_DEPTH = 4;
const LOG_LEVEL_PRIORITY = { debug: 10, info: 20, warn: 30, error: 40 } as const;

export type ScaleSetLogLevel = keyof typeof LOG_LEVEL_PRIORITY;

export interface ScaleSetLogger {
  debug(event: string, attributes?: Readonly<Record<string, unknown>>): void;
  info(event: string, attributes?: Readonly<Record<string, unknown>>): void;
  warn(event: string, attributes?: Readonly<Record<string, unknown>>): void;
  error(event: string, attributes?: Readonly<Record<string, unknown>>): void;
}

function sanitizeString(value: string): string {
  return value.replace(/[\r\n\u2028\u2029]/g, ' ').slice(0, MAX_LOG_STRING_LENGTH);
}

function sanitize(value: unknown, key: string, depth: number): unknown {
  if (SENSITIVE_KEY.test(key)) return REDACTED;
  if (depth > MAX_LOG_DEPTH) return '[TRUNCATED]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return sanitizeString(value);
  if (value instanceof Error) {
    const status = 'status' in value && typeof value.status === 'number' ? value.status : undefined;
    const code = 'code' in value && typeof value.code === 'string' ? sanitizeString(value.code) : undefined;
    const message = SAFE_ERROR_MESSAGE_NAMES.has(value.name) ? sanitizeString(value.message) : undefined;
    return {
      name: sanitizeString(value.name),
      ...(message ? { message } : {}),
      ...(status === undefined ? {} : { status }),
      ...(code ? { code } : {}),
    };
  }
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, key, depth + 1));
  if (typeof value === 'object') {
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [childKey, childValue] of Object.entries(value).slice(0, 100)) {
      result[sanitizeString(childKey)] = sanitize(childValue, childKey, depth + 1);
    }
    return result;
  }
  return sanitizeString(typeof value);
}

export function sanitizeLogAttributes(attributes: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return sanitize(attributes, '', 0) as Record<string, unknown>;
}

function parseLogLevel(value: string | undefined): ScaleSetLogLevel {
  return value !== undefined && value in LOG_LEVEL_PRIORITY ? (value as ScaleSetLogLevel) : 'info';
}

function write(
  level: ScaleSetLogLevel,
  minimumLevel: ScaleSetLogLevel,
  event: string,
  attributes?: Readonly<Record<string, unknown>>,
): void {
  if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[minimumLevel]) return;
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event: sanitizeString(event),
    ...sanitizeLogAttributes(attributes),
  });
  if (level === 'error') console.error(record);
  else if (level === 'warn') console.warn(record);
  else if (level === 'info') console.info(record);
  else console.debug(record);
}

export function createScaleSetLogger(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ScaleSetLogger {
  const minimumLevel = parseLogLevel(environment.LOG_LEVEL);
  return {
    debug: (event, attributes) => write('debug', minimumLevel, event, attributes),
    info: (event, attributes) => write('info', minimumLevel, event, attributes),
    warn: (event, attributes) => write('warn', minimumLevel, event, attributes),
    error: (event, attributes) => write('error', minimumLevel, event, attributes),
  };
}

export const logger = createScaleSetLogger();
