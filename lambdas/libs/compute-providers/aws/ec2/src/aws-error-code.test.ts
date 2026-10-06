import { describe, expect, it } from 'vitest';

import { dynamoDbSdkError, ec2SdkError } from '../../../test/aws-sdk-errors';
import { awsErrorCode, failureDetails, requestFailureCodes } from './runners';

describe('awsErrorCode', () => {
  it('reads the code of an EC2 error deserialized by the installed SDK', async () => {
    const error = await ec2SdkError(
      'InsufficientInstanceCapacity',
      'We currently do not have sufficient capacity.',
      500,
    );

    expect(error.name).toBe('Error');
    expect(awsErrorCode(error)).toBe('InsufficientInstanceCapacity');
  });

  it('reads the code of a DynamoDB error deserialized by the installed SDK', async () => {
    const error = await dynamoDbSdkError('ConditionalCheckFailedException', 'The conditional request failed');

    expect(awsErrorCode(error)).toBe('ConditionalCheckFailedException');
  });

  it('prefers a specific error name', () => {
    expect(awsErrorCode(Object.assign(new Error('boom'), { name: 'ThrottlingException', Code: 'Other' }))).toBe(
      'ThrottlingException',
    );
  });

  it.each([
    [
      'Code',
      Object.assign(new Error('a message'), { Code: 'RequestResourceCountExceeded' }),
      'RequestResourceCountExceeded',
    ],
    ['code', Object.assign(new Error('a message'), { code: 'ECONNRESET' }), 'ECONNRESET'],
    [
      '__type',
      Object.assign(new Error('a message'), { __type: 'ns#ResourceNotFoundException' }),
      'ResourceNotFoundException',
    ],
    ['message', new Error('ConditionalCheckFailedException'), 'ConditionalCheckFailedException'],
  ])('falls back to %s', (_field, error, expected) => {
    expect(awsErrorCode(error)).toBe(expected);
  });

  it('follows the error cause', () => {
    const cause = Object.assign(new Error('a message'), { Code: 'InsufficientInstanceCapacity' });

    expect(awsErrorCode(new Error('wrapped failure', { cause }))).toBe('InsufficientInstanceCapacity');
  });

  it('returns undefined without a code', () => {
    expect(awsErrorCode(new Error('describe failed'))).toBeUndefined();
    expect(awsErrorCode('not an error')).toBeUndefined();
  });

  it('stops on a cause cycle', () => {
    const error = new Error('a message');
    (error as Error & { cause: unknown }).cause = error;

    expect(awsErrorCode(error)).toBeUndefined();
  });
});

describe('requestFailureCodes', () => {
  it('records the AWS code of an SDK error', async () => {
    const error = await ec2SdkError('InsufficientInstanceCapacity', 'No capacity.', 500);

    expect(requestFailureCodes(error)).toEqual(
      expect.arrayContaining([
        'aws-name:Error',
        'aws-code:InsufficientInstanceCapacity',
        'aws-fault:server',
        'aws-http:500',
      ]),
    );
    expect(failureDetails(error)).toMatchObject({ awsErrorCode: 'InsufficientInstanceCapacity' });
  });
});
