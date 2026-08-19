import { getParameters } from '@aws-github-runner/aws-ssm-util';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAwsSsmGitHubAppCredentialsStore } from './github-app-credentials-store';

vi.mock('@aws-github-runner/aws-ssm-util', () => ({
  getParameters: vi.fn(),
}));

const getParametersMock = vi.mocked(getParameters);
const cleanEnv = process.env;
const primaryIdParameter = '/actions-runner/test/github_app_id';
const primaryKeyParameter = '/actions-runner/test/github_app_key_base64';

describe('aws_ssm GitHub App credentials store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...cleanEnv };
    process.env.PARAMETER_GITHUB_APP_ID_NAME = primaryIdParameter;
    process.env.PARAMETER_GITHUB_APP_KEY_BASE64_NAME = primaryKeyParameter;
    delete process.env.PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME;
  });

  it('batch reads and maps the primary GitHub App credential', async () => {
    const privateKey = 'fake-private-key';
    getParametersMock.mockResolvedValue(
      new Map([
        [primaryIdParameter, '123'],
        [primaryKeyParameter, Buffer.from(privateKey).toString('base64')],
      ]),
    );
    const store = createAwsSsmGitHubAppCredentialsStore();

    await expect(store.get()).resolves.toEqual([{ appId: 123, privateKey, installationId: undefined }]);
    expect(getParametersMock).toHaveBeenCalledOnce();
    expect(getParametersMock).toHaveBeenCalledWith([primaryIdParameter, primaryKeyParameter]);
  });

  it('preserves multi-app order and optional installation-id slots', async () => {
    const additionalIdParameter = '/actions-runner/test/additional_github_app_0_id';
    const additionalKeyParameter = '/actions-runner/test/additional_github_app_0_key_base64';
    const additionalInstallationIdParameter = '/actions-runner/test/additional_github_app_0_installation_id';
    process.env.PARAMETER_GITHUB_APP_ID_NAME = `${primaryIdParameter}:${additionalIdParameter}`;
    process.env.PARAMETER_GITHUB_APP_KEY_BASE64_NAME = `${primaryKeyParameter}:${additionalKeyParameter}`;
    process.env.PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME = `:${additionalInstallationIdParameter}`;
    getParametersMock.mockResolvedValue(
      new Map([
        [primaryIdParameter, '123'],
        [primaryKeyParameter, Buffer.from('primary-key').toString('base64')],
        [additionalIdParameter, '456'],
        [additionalKeyParameter, Buffer.from('additional-key').toString('base64')],
        [additionalInstallationIdParameter, '789'],
      ]),
    );
    const store = createAwsSsmGitHubAppCredentialsStore();

    await expect(store.get()).resolves.toEqual([
      { appId: 123, privateKey: 'primary-key', installationId: undefined },
      { appId: 456, privateKey: 'additional-key', installationId: 789 },
    ]);
    expect(getParametersMock).toHaveBeenCalledWith([
      primaryIdParameter,
      additionalIdParameter,
      primaryKeyParameter,
      additionalKeyParameter,
      additionalInstallationIdParameter,
    ]);
  });

  it('decodes literal newline escapes in a base64 private key', async () => {
    getParametersMock.mockResolvedValue(
      new Map([
        [primaryIdParameter, '123'],
        [primaryKeyParameter, Buffer.from('first-line\\nsecond-line').toString('base64')],
      ]),
    );
    const store = createAwsSsmGitHubAppCredentialsStore();

    await expect(store.get()).resolves.toEqual([
      { appId: 123, privateKey: 'first-line\nsecond-line', installationId: undefined },
    ]);
  });

  it('preserves parseInt behavior for stored numeric values', async () => {
    const installationIdParameter = '/actions-runner/test/github_app_installation_id';
    process.env.PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME = installationIdParameter;
    getParametersMock.mockResolvedValue(
      new Map([
        [primaryIdParameter, '123app'],
        [primaryKeyParameter, Buffer.from('fake-private-key').toString('base64')],
        [installationIdParameter, '789installation'],
      ]),
    );
    const store = createAwsSsmGitHubAppCredentialsStore();

    await expect(store.get()).resolves.toEqual([{ appId: 123, privateKey: 'fake-private-key', installationId: 789 }]);
  });

  it.each([
    ['PARAMETER_GITHUB_APP_ID_NAME', undefined],
    ['PARAMETER_GITHUB_APP_ID_NAME', ''],
    ['PARAMETER_GITHUB_APP_KEY_BASE64_NAME', undefined],
    ['PARAMETER_GITHUB_APP_KEY_BASE64_NAME', ''],
  ] as const)('rejects missing environment value %s=%j before reading', async (name, value) => {
    setEnvironmentValue(name, value);
    const store = createAwsSsmGitHubAppCredentialsStore();

    await expect(store.get()).rejects.toThrow(`Environment variable ${name} is not set`);
    expect(getParametersMock).not.toHaveBeenCalled();
  });

  it('rejects mismatched GitHub App id and key parameter counts before reading', async () => {
    process.env.PARAMETER_GITHUB_APP_ID_NAME = `${primaryIdParameter}:/additional/id`;
    const store = createAwsSsmGitHubAppCredentialsStore();

    await expect(store.get()).rejects.toThrow('GitHub App parameter count mismatch: 2 IDs vs 1 keys');
    expect(getParametersMock).not.toHaveBeenCalled();
  });

  it('rejects a missing GitHub App id parameter', async () => {
    getParametersMock.mockResolvedValue(
      new Map([[primaryKeyParameter, Buffer.from('fake-private-key').toString('base64')]]),
    );
    const store = createAwsSsmGitHubAppCredentialsStore();

    await expect(store.get()).rejects.toThrow(`Parameter ${primaryIdParameter} not found`);
  });

  it('rejects a missing GitHub App private-key parameter', async () => {
    getParametersMock.mockResolvedValue(new Map([[primaryIdParameter, '123']]));
    const store = createAwsSsmGitHubAppCredentialsStore();

    await expect(store.get()).rejects.toThrow(`Parameter ${primaryKeyParameter} not found`);
  });

  it('propagates parameter-store read errors', async () => {
    const error = new Error('access denied');
    getParametersMock.mockRejectedValue(error);
    const store = createAwsSsmGitHubAppCredentialsStore();

    await expect(store.get()).rejects.toBe(error);
  });
});

function setEnvironmentValue(
  name: 'PARAMETER_GITHUB_APP_ID_NAME' | 'PARAMETER_GITHUB_APP_KEY_BASE64_NAME',
  value: string | undefined,
): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
