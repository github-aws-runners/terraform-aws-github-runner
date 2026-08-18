import { DeleteParameterCommand, GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createAwsSsmRunnerConfigStore } from './runner-config-store';

const mockSSMClient = mockClient(SSMClient);
const cleanEnv = process.env;
const minimumDaysOld = 1;
const now = new Date();
const oldDate = new Date();
oldDate.setDate(oldDate.getDate() - minimumDaysOld - 1);
const tokenPath = '/path/to/tokens/';

describe('aws_ssm runner config housekeeper', () => {
  beforeEach(() => {
    mockSSMClient.reset();
    process.env = { ...cleanEnv };
    delete process.env.SSM_TOKEN_PATH;
    process.env.AWS_REGION = 'eu-east-1';
    setCleanupOptions({ dryRun: false, minimumDaysOld, tokenPath });

    mockSSMClient.on(GetParametersByPathCommand).resolves({
      Parameters: undefined,
    });
    mockSSMClient.on(GetParametersByPathCommand, { Path: tokenPath }).resolves({
      Parameters: [
        {
          Name: `${tokenPath}i-old-01`,
          LastModifiedDate: oldDate,
        },
      ],
      NextToken: 'next',
    });
    mockSSMClient.on(GetParametersByPathCommand, { Path: tokenPath, NextToken: 'next' }).resolves({
      Parameters: [
        {
          Name: `${tokenPath}i-new-01`,
          LastModifiedDate: now,
        },
      ],
      NextToken: undefined,
    });
  });

  it('constructs without writer configuration and deletes expired records across pages', async () => {
    const store = createAwsSsmRunnerConfigStore();

    await store.houseKeeper();

    expect(mockSSMClient).toHaveReceivedCommandWith(GetParametersByPathCommand, { Path: tokenPath });
    expect(mockSSMClient).toHaveReceivedCommandWith(DeleteParameterCommand, { Name: `${tokenPath}i-old-01` });
    expect(mockSSMClient).not.toHaveReceivedCommandWith(DeleteParameterCommand, { Name: `${tokenPath}i-new-01` });
  });

  it('does not delete records during a dry run', async () => {
    setCleanupOptions({ dryRun: true, minimumDaysOld, tokenPath });
    const store = createAwsSsmRunnerConfigStore();

    await store.houseKeeper();

    expect(mockSSMClient).toHaveReceivedCommandWith(GetParametersByPathCommand, { Path: tokenPath });
    expect(mockSSMClient).not.toHaveReceivedCommand(DeleteParameterCommand);
  });

  it('does not delete when no records are found', async () => {
    setCleanupOptions({ dryRun: false, minimumDaysOld, tokenPath: 'does-not-exist' });
    const store = createAwsSsmRunnerConfigStore();

    await expect(store.houseKeeper()).resolves.not.toThrow();

    expect(mockSSMClient).not.toHaveReceivedCommand(DeleteParameterCommand);
  });

  it('continues when deleting an expired record fails', async () => {
    mockSSMClient.on(DeleteParameterCommand).rejects(new Error('ParameterNotFound'));
    const store = createAwsSsmRunnerConfigStore();

    await expect(store.houseKeeper()).resolves.not.toThrow();
  });

  it.each([
    { dryRun: false, minimumDaysOld: undefined as unknown as number, tokenPath },
    { dryRun: false, minimumDaysOld: 0, tokenPath },
    { dryRun: false, minimumDaysOld, tokenPath: undefined as unknown as string },
  ])('rejects invalid cleanup options %#', async (options) => {
    setCleanupOptions(options);
    const store = createAwsSsmRunnerConfigStore();

    await expect(store.houseKeeper()).rejects.toBeInstanceOf(Error);
  });
});

function setCleanupOptions(options: { dryRun: boolean; minimumDaysOld: number; tokenPath: string }): void {
  process.env.SSM_CLEANUP_CONFIG = JSON.stringify(options);
}
