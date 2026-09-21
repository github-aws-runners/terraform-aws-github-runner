import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getParameter, getParameters } from '@aws-github-runner/aws-ssm-util';

import { createAwsSsmGitHubAppCredentialsStore } from './github-app-credentials-store';

vi.mock('@aws-github-runner/aws-ssm-util', () => ({
  getParameter: vi.fn(),
  getParameters: vi.fn(),
}));

const getParametersMock = vi.mocked(getParameters);
const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@aws-github-runner/aws-powertools-util', () => ({
  createChildLogger: vi.fn(() => ({
    ...loggerMock,
    appendPersistentKeys: vi.fn(),
  })),
}));

describe('aws_ssm GitHub App credentials store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PARAMETER_GITHUB_APP_ID_NAME = 'app-id';
    process.env.PARAMETER_GITHUB_APP_KEY_BASE64_NAME = 'app-key';
    delete process.env.PARAMETER_GITHUB_APPS_MANIFEST_NAME;
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
    process.env.PARAMETER_GITHUB_APP_ID_NAME = 'id-0';
    process.env.PARAMETER_GITHUB_APP_KEY_BASE64_NAME = 'key-0';
    process.env.PARAMETER_GITHUB_APPS_MANIFEST_NAME = 'manifest';
    vi.mocked(getParameter).mockResolvedValue(
      JSON.stringify([{ idParamName: 'id-1', keyParamName: 'key-1', installationIdParamName: 'installation-1' }]),
    );
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

  it.each(['PARAMETER_GITHUB_APP_ID_NAME', 'PARAMETER_GITHUB_APP_KEY_BASE64_NAME'])('requires %s', (name) => {
    delete process.env[name];
    expect(() => createAwsSsmGitHubAppCredentialsStore()).toThrow(`Environment variable ${name} is not set`);
  });

  it('rejects malformed manifest JSON', async () => {
    process.env.PARAMETER_GITHUB_APPS_MANIFEST_NAME = 'manifest';
    vi.mocked(getParameter).mockResolvedValue('invalid-json');
    await expect(createAwsSsmGitHubAppCredentialsStore().get()).rejects.toThrow();
    expect(getParametersMock).not.toHaveBeenCalled();
  });

  it('logs safe context when a credential parameter is missing', async () => {
    getParametersMock.mockResolvedValue(new Map([['app-key', Buffer.from('private-key').toString('base64')]]));

    await expect(createAwsSsmGitHubAppCredentialsStore().get()).rejects.toThrow('Parameter app-id not found');

    expect(loggerMock.error).toHaveBeenCalledWith('GitHub App credential parameter is missing', {
      credentialField: 'appId',
      appIndex: 0,
      parameterName: 'app-id',
    });
    expect(JSON.stringify(loggerMock.error.mock.calls)).not.toContain('private-key');
  });

  it('logs only error names when the provider lookup fails', async () => {
    const error = Object.assign(new Error('private-key-secret'), { name: 'InternalServerException' });
    getParametersMock.mockRejectedValue(error);

    await expect(createAwsSsmGitHubAppCredentialsStore().get()).rejects.toBe(error);

    expect(loggerMock.error).toHaveBeenCalledWith('Failed to read GitHub App credential parameters', {
      parameterCount: 2,
      appCount: 1,
      errorNames: ['InternalServerException'],
    });
    expect(JSON.stringify(loggerMock.error.mock.calls)).not.toContain('private-key-secret');
  });
});
