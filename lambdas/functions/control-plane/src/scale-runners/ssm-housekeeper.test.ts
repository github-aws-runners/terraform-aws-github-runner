import { DeleteParameterCommand, GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';
import { cleanSSMTokens } from './ssm-housekeeper';
import { describe, it, expect, beforeEach } from 'vitest';

process.env.AWS_REGION = 'eu-east-1';

const mockSSMClient = mockClient(SSMClient);

const deleteAmisOlderThenDays = 1;
const now = new Date();
const dateOld = new Date();
dateOld.setDate(dateOld.getDate() - deleteAmisOlderThenDays - 1);

const tokenPath = '/path/to/tokens/';

describe('clean SSM tokens / JIT config', () => {
  beforeEach(() => {
    mockSSMClient.reset();
    mockSSMClient.on(GetParametersByPathCommand).resolves({
      Parameters: undefined,
    });
    mockSSMClient.on(GetParametersByPathCommand, { Path: tokenPath }).resolves({
      Parameters: [
        {
          Name: tokenPath + 'i-old-01',
          LastModifiedDate: dateOld,
        },
      ],
      NextToken: 'next',
    });
    mockSSMClient.on(GetParametersByPathCommand, { Path: tokenPath, NextToken: 'next' }).resolves({
      Parameters: [
        {
          Name: tokenPath + 'i-new-01',
          LastModifiedDate: now,
        },
      ],
      NextToken: undefined,
    });
  });

  it('should delete parameters older then minimumDaysOld', async () => {
    await cleanSSMTokens({
      dryRun: false,
      minimumDaysOld: deleteAmisOlderThenDays,
      tokenPath: tokenPath,
    });

    expect(mockSSMClient).toHaveReceivedCommandWith(GetParametersByPathCommand, { Path: tokenPath });
    expect(mockSSMClient).toHaveReceivedCommandWith(DeleteParameterCommand, { Name: tokenPath + 'i-old-01' });
    expect(mockSSMClient).not.toHaveReceivedCommandWith(DeleteParameterCommand, { Name: tokenPath + 'i-new-01' });
  });

  it('should not delete when dry run is activated', async () => {
    await cleanSSMTokens({
      dryRun: true,
      minimumDaysOld: deleteAmisOlderThenDays,
      tokenPath: tokenPath,
    });

    expect(mockSSMClient).toHaveReceivedCommandWith(GetParametersByPathCommand, { Path: tokenPath });
    expect(mockSSMClient).not.toHaveReceivedCommandWith(DeleteParameterCommand, { Name: tokenPath + 'i-old-01' });
    expect(mockSSMClient).not.toHaveReceivedCommandWith(DeleteParameterCommand, { Name: tokenPath + 'i-new-01' });
  });

  it('should not call delete when no parameters are found.', async () => {
    await expect(
      cleanSSMTokens({
        dryRun: false,
        minimumDaysOld: deleteAmisOlderThenDays,
        tokenPath: 'no-exist',
      }),
    ).resolves.not.toThrow();

    expect(mockSSMClient).not.toHaveReceivedCommandWith(DeleteParameterCommand, { Name: tokenPath + 'i-old-01' });
    expect(mockSSMClient).not.toHaveReceivedCommandWith(DeleteParameterCommand, { Name: tokenPath + 'i-new-01' });
  });

  it('should not error on delete failure.', async () => {
    mockSSMClient.on(DeleteParameterCommand).rejects(new Error('ParameterNotFound'));

    await expect(
      cleanSSMTokens({
        dryRun: false,
        minimumDaysOld: deleteAmisOlderThenDays,
        tokenPath: tokenPath,
      }),
    ).resolves.not.toThrow();
  });

  it('should only accept valid options.', async () => {
    await expect(
      cleanSSMTokens({
        dryRun: false,
        minimumDaysOld: undefined as unknown as number,
        tokenPath: tokenPath,
      }),
    ).rejects.toBeInstanceOf(Error);

    await expect(
      cleanSSMTokens({
        dryRun: false,
        minimumDaysOld: 0,
        tokenPath: tokenPath,
      }),
    ).rejects.toBeInstanceOf(Error);

    await expect(
      cleanSSMTokens({
        dryRun: false,
        minimumDaysOld: 1,
        tokenPath: undefined as unknown as string,
      }),
    ).rejects.toBeInstanceOf(Error);
  });
});
