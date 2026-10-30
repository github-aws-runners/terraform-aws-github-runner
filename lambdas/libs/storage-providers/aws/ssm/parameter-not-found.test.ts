import { describe, expect, it } from 'vitest';

import { isParameterNotFoundError } from './parameter-not-found';

// Shape thrown by the AWS SDK when it cannot resolve the modeled exception
// class: a plain Error whose message is the error code, decorated with the
// response metadata and the parsed JSON error body.
function sdkFallbackError(code: string, body: Record<string, unknown> = { __type: code }): Error {
  return Object.assign(new Error(code), {
    $fault: 'client',
    $metadata: { httpStatusCode: 400, requestId: 'request-id', attempts: 1, totalRetryDelay: 0 },
    ...body,
  });
}

describe('isParameterNotFoundError', () => {
  it('matches the modeled exception by name, directly or in the cause chain', () => {
    const notFound = Object.assign(new Error('missing'), { name: 'ParameterNotFound' });

    expect(isParameterNotFoundError(notFound)).toBe(true);
    expect(
      isParameterNotFoundError(Object.assign(new Error('wrapped'), { name: 'GetParameterError', cause: notFound })),
    ).toBe(true);
  });

  it('matches the SDK fallback error by message when the name is generic', () => {
    const cause = new Error('ParameterNotFound');
    const error = Object.assign(new Error('ParameterNotFound'), { name: 'GetParameterError', cause });

    expect(isParameterNotFoundError(cause)).toBe(true);
    expect(isParameterNotFoundError(error)).toBe(true);
  });

  it.each([
    { __type: 'ParameterNotFound' },
    { __type: 'com.amazonaws.ssm#ParameterNotFound' },
    { Code: 'ParameterNotFound' },
    { code: 'ParameterNotFound' },
  ])('matches the SDK error code field %o', (body) => {
    const error = Object.assign(sdkFallbackError('UnknownError', body), { message: 'UnknownError' });

    expect(isParameterNotFoundError(error)).toBe(true);
  });

  it.each(['AccessDeniedException', 'ThrottlingException', 'ParameterVersionNotFound', 'InvalidKeyId'])(
    'does not match %s',
    (code) => {
      const error = Object.assign(new Error('wrapped'), { name: 'GetParameterError', cause: sdkFallbackError(code) });

      expect(isParameterNotFoundError(error)).toBe(false);
    },
  );

  it('does not match on message when the error has a specific name', () => {
    const error = Object.assign(new Error('ParameterNotFound'), { name: 'GetParameterError' });

    expect(isParameterNotFoundError(error)).toBe(false);
  });

  it('handles non-objects and cyclic cause chains', () => {
    const error: Error & { cause?: unknown } = new Error('boom');
    error.cause = error;

    expect(isParameterNotFoundError(undefined)).toBe(false);
    expect(isParameterNotFoundError('ParameterNotFound')).toBe(false);
    expect(isParameterNotFoundError(error)).toBe(false);
  });
});
