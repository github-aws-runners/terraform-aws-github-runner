import { getParameter } from '@aws-github-runner/aws-ssm-util';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAwsSsmGitHubWebhookSecretStore } from './github-webhook-secret-store';

vi.mock('@aws-github-runner/aws-ssm-util', () => ({
  getParameter: vi.fn(),
}));

const getParameterMock = vi.mocked(getParameter);
const cleanEnv = process.env;
const webhookSecretParameter = '/actions-runner/test/webhook_secret';

describe('aws_ssm GitHub webhook secret store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...cleanEnv };
    process.env.PARAMETER_GITHUB_APP_WEBHOOK_SECRET = webhookSecretParameter;
  });

  it('loads the webhook secret parameter', async () => {
    getParameterMock.mockResolvedValue('fake-webhook-secret');
    const store = createAwsSsmGitHubWebhookSecretStore();

    await expect(store.get()).resolves.toBe('fake-webhook-secret');
    expect(getParameterMock).toHaveBeenCalledOnce();
    expect(getParameterMock).toHaveBeenCalledWith(webhookSecretParameter);
  });

  it('wraps a parameter read failure with the legacy error message', async () => {
    getParameterMock.mockRejectedValue(new Error('access denied'));
    const store = createAwsSsmGitHubWebhookSecretStore();

    await expect(store.get()).rejects.toThrow(
      `Failed to load parameter for webhookSecret from path ${webhookSecretParameter}: access denied`,
    );
  });

  it.each([undefined, '', '   '])('requires a webhook secret parameter path for input %j', (parameterPath) => {
    if (parameterPath === undefined) {
      delete process.env.PARAMETER_GITHUB_APP_WEBHOOK_SECRET;
    } else {
      process.env.PARAMETER_GITHUB_APP_WEBHOOK_SECRET = parameterPath;
    }

    expect(() => createAwsSsmGitHubWebhookSecretStore()).toThrow(
      'Environment variable PARAMETER_GITHUB_APP_WEBHOOK_SECRET is not set',
    );
    expect(getParameterMock).not.toHaveBeenCalled();
  });
});
