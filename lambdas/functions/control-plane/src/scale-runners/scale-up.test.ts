import * as ghAuth from '../github/auth';
import * as scaleUpModule from './scale-up';
import type { ActionRequestMessageSQS } from './types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../github/auth', () => ({
  createGithubAppAuth: vi.fn(),
  createGithubInstallationAuth: vi.fn(),
  createOctokitClient: vi.fn(),
}));

const mockedAppAuth = vi.mocked(ghAuth.createGithubAppAuth);
const cleanEnv = process.env;

const TEST_DATA: ActionRequestMessageSQS[] = [
  {
    id: 1,
    eventType: 'workflow_job',
    repositoryName: 'hello-world',
    repositoryOwner: 'Codertocat',
    installationId: 2,
    repoOwnerType: 'Organization',
    messageId: 'foobar',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...cleanEnv };
});

describe('runner provider selection', () => {
  it('rejects unsupported scale-up provider types', async () => {
    process.env.RUNNER_PROVIDER_TYPE = 'microvm';

    await expect(scaleUpModule.scaleUp(TEST_DATA)).rejects.toThrow("Unsupported runner provider type 'microvm'");
    expect(mockedAppAuth).not.toHaveBeenCalled();
  });
});
