import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetSSMClient } from '@aws-github-runner/aws-ssm-util';

import { createAwsSsmGitHubAppCredentialsStore } from './github-app-credentials-store';

vi.mock('@aws-github-runner/aws-powertools-util', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@aws-github-runner/aws-powertools-util')>()),
  createChildLogger: vi.fn(() => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    appendPersistentKeys: vi.fn(),
  })),
}));

const mockSSMClient = mockClient(SSMClient);

describe('aws_ssm GitHub App credentials store with parameter ARNs', () => {
  const idArn = 'arn:aws:ssm:us-east-1:111111111111:parameter/github-runners/app/id';
  const keyArn = 'arn:aws:ssm:us-east-1:111111111111:parameter/github-runners/app/key_base64';

  beforeEach(() => {
    mockSSMClient.reset();
    resetSSMClient();
    process.env.PARAMETER_GITHUB_APP_ID_NAME = idArn;
    process.env.PARAMETER_GITHUB_APP_KEY_BASE64_NAME = keyArn;
    delete process.env.PARAMETER_GITHUB_APPS_MANIFEST_NAME;
  });

  it('resolves credentials when SSM returns plain names for ARN requests', async () => {
    mockSSMClient.on(GetParametersCommand).resolves({
      Parameters: [
        { Name: '/github-runners/app/id', ARN: idArn, Value: '123' },
        { Name: '/github-runners/app/key_base64', ARN: keyArn, Value: Buffer.from('fake-key').toString('base64') },
      ],
    });

    await expect(createAwsSsmGitHubAppCredentialsStore().get()).resolves.toEqual([
      { appId: 123, privateKey: 'fake-key', installationId: undefined },
    ]);
    expect(mockSSMClient).toHaveReceivedCommandWith(GetParametersCommand, { Names: [idArn, keyArn] });
  });
});
