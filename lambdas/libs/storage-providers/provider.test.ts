import { describe, expect, it } from 'vitest';

import { resolveRunnerConfigStorageProvider } from './provider';

describe('resolveRunnerConfigStorageProvider', () => {
  it.each([undefined, '', '  ', 'aws_ssm', 'AWS_SSM'])('resolves %j to aws_ssm', (value) => {
    expect(resolveRunnerConfigStorageProvider(value)).toBe('aws_ssm');
  });

  it.each([null, 'dynamodb', 'aws-ssm'])('rejects unsupported providers: %j', (value) => {
    expect(() => resolveRunnerConfigStorageProvider(value)).toThrow(
      `Unsupported runner config storage provider '${value}'`,
    );
  });
});
