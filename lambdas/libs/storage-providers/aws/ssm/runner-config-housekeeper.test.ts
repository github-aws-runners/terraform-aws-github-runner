import { DeleteParameterCommand, GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';
import { cleanSSMTokens } from './runner-config-housekeeper';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

process.env.AWS_REGION = 'eu-east-1';

const mockSSMClient = mockClient(SSMClient);

const deleteAmisOlderThenDays = 1;
const now = new Date();
const dateOld = new Date();
dateOld.setDate(dateOld.getDate() - deleteAmisOlderThenDays - 1);

const tokenPath = '/path/to/tokens/';

describe('clean SSM tokens / JIT config', () => {
  afterEach(() => vi.unstubAllEnvs());
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

  it.each([undefined, []])('keeps later pages when the first page has no parameters (%s)', async (firstPage) => {
    mockSSMClient.reset();
    mockSSMClient
      .on(GetParametersByPathCommand)
      .resolvesOnce({ Parameters: firstPage, NextToken: 'empty-page' })
      .resolvesOnce({ NextToken: 'last-page' })
      .resolvesOnce({ Parameters: [{ Name: tokenPath + 'i-old-later', LastModifiedDate: dateOld }] });

    await cleanSSMTokens({ dryRun: false, minimumDaysOld: 1, tokenPath });

    expect(mockSSMClient).toHaveReceivedCommandTimes(GetParametersByPathCommand, 3);
    expect(mockSSMClient).toHaveReceivedCommandWith(GetParametersByPathCommand, {
      Path: tokenPath,
      NextToken: 'last-page',
    });
    expect(mockSSMClient).toHaveReceivedCommandWith(DeleteParameterCommand, { Name: tokenPath + 'i-old-later' });
  });

  it('keeps deletions from earlier pages when a later listing page fails', async () => {
    mockSSMClient
      .on(GetParametersByPathCommand, { Path: tokenPath, NextToken: 'next' })
      .rejects(new Error('SSM unavailable'));

    await expect(cleanSSMTokens({ dryRun: false, minimumDaysOld: 1, tokenPath })).rejects.toThrow('SSM unavailable');

    expect(mockSSMClient).toHaveReceivedCommandWith(DeleteParameterCommand, { Name: tokenPath + 'i-old-01' });
  });

  it('starts fresh against remaining parameters after an interrupted invocation', async () => {
    let remaining = 60000;
    const inventory = [
      { Name: tokenPath + 'first', LastModifiedDate: dateOld },
      { Name: tokenPath + 'second', LastModifiedDate: dateOld },
    ];
    mockSSMClient.reset();
    mockSSMClient.on(GetParametersByPathCommand).callsFake(() => ({ Parameters: [...inventory] }));
    mockSSMClient.on(DeleteParameterCommand).callsFake((input) => {
      inventory.splice(
        inventory.findIndex((item) => item.Name === input.Name),
        1,
      );
      remaining = 0;
      return {};
    });
    await cleanSSMTokens({ dryRun: false, minimumDaysOld: 1, tokenPath }, () => remaining);
    expect(inventory).toHaveLength(1);
    mockSSMClient.resetHistory();
    await cleanSSMTokens({ dryRun: false, minimumDaysOld: 1, tokenPath });
    expect(mockSSMClient.commandCalls(GetParametersByPathCommand)[0].args[0].input.NextToken).toBeUndefined();
    expect(mockSSMClient).not.toHaveReceivedCommandWith(DeleteParameterCommand, { Name: tokenPath + 'first' });
    expect(inventory).toHaveLength(0);
  });

  it('continues past a failed deletion within the same invocation', async () => {
    mockSSMClient.on(GetParametersByPathCommand, { Path: tokenPath }).resolves({
      Parameters: [
        { Name: tokenPath + 'failed', LastModifiedDate: dateOld },
        { Name: tokenPath + 'healthy', LastModifiedDate: dateOld },
      ],
    });
    mockSSMClient.on(DeleteParameterCommand, { Name: tokenPath + 'failed' }).rejects(new Error('Denied'));
    await cleanSSMTokens({ dryRun: false, minimumDaysOld: 1, tokenPath });
    expect(mockSSMClient).toHaveReceivedCommandWith(DeleteParameterCommand, { Name: tokenPath + 'healthy' });
  });

  it('deletes a page before requesting the next page', async () => {
    mockSSMClient.on(GetParametersByPathCommand, { Path: tokenPath, NextToken: 'next' }).callsFake(() => {
      expect(mockSSMClient).toHaveReceivedCommandWith(DeleteParameterCommand, { Name: tokenPath + 'i-old-01' });
      return {};
    });
    await cleanSSMTokens({ dryRun: false, minimumDaysOld: 1, tokenPath });
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
