const PARAMETER_NOT_FOUND = 'ParameterNotFound';

// Error-code fields the AWS SDK copies onto service exceptions. When the SDK
// cannot resolve a modeled exception class it falls back to a plain `Error`
// (name `Error`, message set to the error code) decorated with the parsed
// response body, so the code is only available through these fields.
const ERROR_CODE_FIELDS = ['__type', 'Code', 'code'] as const;

/**
 * Returns true when any error in the cause chain identifies an SSM
 * `ParameterNotFound` service error. Recognises the modeled exception (by name)
 * and the SDK's generic fallback error (by error code field, or by message when
 * the name is the generic `Error`).
 */
export function isParameterNotFoundError(error: unknown): boolean {
  const seen = new Set<object>();
  let current: unknown = error;

  while (current !== null && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if (isParameterNotFound(current)) {
      return true;
    }
    current = 'cause' in current ? current.cause : undefined;
  }

  return false;
}

function isParameterNotFound(error: object): boolean {
  const record = error as Record<string, unknown>;
  if (record.name === PARAMETER_NOT_FOUND) {
    return true;
  }
  if (ERROR_CODE_FIELDS.some((field) => normalizeErrorCode(record[field]) === PARAMETER_NOT_FOUND)) {
    return true;
  }
  const hasGenericName = record.name === undefined || record.name === 'Error';
  return hasGenericName && record.message === PARAMETER_NOT_FOUND;
}

// Mirrors the SDK's error-code sanitising: `ns#Code:extra,more` -> `Code`.
function normalizeErrorCode(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  let code = value.split(',')[0].split(':')[0];
  if (code.includes('#')) {
    code = code.split('#')[1];
  }
  return code.trim();
}
