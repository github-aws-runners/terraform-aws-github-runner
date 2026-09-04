import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getParameters } from '@aws-github-runner/aws-ssm-util';

import { createAwsSsmGitHubAppCredentialsStore } from './github-app-credentials-store';

vi.mock('@aws-github-runner/aws-ssm-util', () => ({
  getParameters: vi.fn(),
}));

const getParametersMock = vi.mocked(getParameters);

describe('aws_ssm GitHub App credentials store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PARAMETER_GITHUB_APP_ID_NAME = 'app-id';
    process.env.PARAMETER_GITHUB_APP_KEY_BASE64_NAME = 'app-key';
    delete process.env.PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME;
  });

  it('loads batched credentials and decodes escaped newlines', async () => {
    const privateKey = Buffer.from('private-key\\nline-2').toString('base64');
    getParametersMock.mockResolvedValue(
      new Map([
        ['app-id', '123'],
        ['app-key', privateKey],
      ]),
    );

    await expect(createAwsSsmGitHubAppCredentialsStore().get()).resolves.toEqual([
      { appId: 123, privateKey: 'private-key\nline-2', installationId: undefined },
    ]);
    expect(getParametersMock).toHaveBeenCalledWith(['app-id', 'app-key']);
  });

  it('loads per-app installation IDs in the same order as app IDs', async () => {
    process.env.PARAMETER_GITHUB_APP_ID_NAME = 'id-0:id-1';
    process.env.PARAMETER_GITHUB_APP_KEY_BASE64_NAME = 'key-0:key-1';
    process.env.PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME = ':installation-1';
    getParametersMock.mockResolvedValue(
      new Map([
        ['id-0', '123'],
        ['id-1', '456'],
        ['key-0', Buffer.from('key-0').toString('base64')],
        ['key-1', Buffer.from('key-1').toString('base64')],
        ['installation-1', '789'],
      ]),
    );

    await expect(createAwsSsmGitHubAppCredentialsStore().get()).resolves.toMatchObject([
      { appId: 123, installationId: undefined },
      { appId: 456, installationId: 789 },
    ]);
  });

  it.each(['PARAMETER_GITHUB_APP_ID_NAME', 'PARAMETER_GITHUB_APP_KEY_BASE64_NAME'])(
    'requires %s',
    (name) => {
      delete process.env[name];
      expect(() => createAwsSsmGitHubAppCredentialsStore()).toThrow(`Environment variable ${name} is not set`);
    },
  );

  it('rejects mismatched app and key parameter lists', () => {
    process.env.PARAMETER_GITHUB_APP_ID_NAME = 'id-0:id-1';
    expect(() => createAwsSsmGitHubAppCredentialsStore()).toThrow('parameter count mismatch');
  });
});
