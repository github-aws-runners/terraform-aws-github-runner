const MAX_CAUSE_DEPTH = 10;
const AWS_ERROR_CODE = /^[A-Za-z][A-Za-z0-9._-]{0,127}$/;

interface AwsErrorFields {
  name?: unknown;
  Code?: unknown;
  __type?: unknown;
  message?: unknown;
  cause?: unknown;
}

function asErrorCode(value: unknown): string | undefined {
  return typeof value === 'string' && value !== 'Error' && AWS_ERROR_CODE.test(value) ? value : undefined;
}

/** AWS error codes of an error and its causes; bundled lambdas can lose `name` and leave the code in `Code`, `__type` or the message. */
export function awsErrorCodes(error: unknown): string[] {
  const codes = new Set<string>();
  const visited = new Set<object>();
  let current = error;

  for (
    let depth = 0;
    depth < MAX_CAUSE_DEPTH && typeof current === 'object' && current !== null && !visited.has(current);
    depth += 1
  ) {
    visited.add(current);
    const fields = current as AwsErrorFields;
    const type = typeof fields.__type === 'string' ? fields.__type.split('#').pop() : undefined;
    for (const candidate of [fields.name, fields.Code, type, fields.message]) {
      const code = asErrorCode(candidate);
      if (code) codes.add(code);
    }
    current = fields.cause;
  }

  return [...codes];
}
