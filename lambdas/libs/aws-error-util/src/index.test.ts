import { describe, expect, it } from 'vitest';

import { awsErrorCodes } from '.';

describe('awsErrorCodes', () => {
  it('reads the name of a correctly deserialized SDK error', () => {
    expect(awsErrorCodes(Object.assign(new Error('Parameter not found.'), { name: 'ParameterNotFound' }))).toEqual([
      'ParameterNotFound',
    ]);
  });

  it.each([
    ['Code', Object.assign(new Error('Not authorized.'), { Code: 'UnauthorizedOperation' }), 'UnauthorizedOperation'],
    ['__type', Object.assign(new Error('Not found.'), { __type: 'ParameterNotFound' }), 'ParameterNotFound'],
    [
      'a namespaced __type',
      Object.assign(new Error('Not found.'), { __type: 'com.amazonaws.ssm#ParameterNotFound' }),
      'ParameterNotFound',
    ],
    ['a bare message', new Error('ThrottlingException'), 'ThrottlingException'],
  ])('reads the code of an unnamed error from %s', (_field, error, expected) => {
    expect(awsErrorCodes(error)).toEqual([expected]);
  });

  it('collects the codes of the whole cause chain', () => {
    const cause = Object.assign(new Error('ParameterNotFound'), { __type: 'ParameterNotFound' });
    const error = Object.assign(new Error('wrapped failure', { cause }), { name: 'GetParameterError' });

    expect(awsErrorCodes(error)).toEqual(['GetParameterError', 'ParameterNotFound']);
  });

  it('ignores the generic Error name and messages that are not a bare code', () => {
    expect(awsErrorCodes(new Error('Parameter /a/b was not found'))).toEqual([]);
    expect(awsErrorCodes(new Error(''))).toEqual([]);
    expect(awsErrorCodes(Object.assign(new Error('not a code'), { Code: 42, __type: 7 }))).toEqual([]);
  });

  it('accepts non-Error objects and ignores other values', () => {
    expect(awsErrorCodes({ name: 'TimeoutError' })).toEqual(['TimeoutError']);
    expect(awsErrorCodes('ParameterNotFound')).toEqual([]);
    expect(awsErrorCodes(undefined)).toEqual([]);
    expect(awsErrorCodes(null)).toEqual([]);
  });

  it('stops on a cause cycle', () => {
    const error = Object.assign(new Error('wrapped failure'), { name: 'GetParameterError' });
    Object.assign(error, { cause: error });

    expect(awsErrorCodes(error)).toEqual(['GetParameterError']);
  });

  it('stops after a bounded cause depth', () => {
    let error: Error = new Error('root failure');
    for (let depth = 0; depth < 30; depth += 1) {
      error = Object.assign(new Error('nested failure', { cause: error }), { name: `Level${depth}` });
    }

    expect(awsErrorCodes(error)).toHaveLength(10);
  });
});
