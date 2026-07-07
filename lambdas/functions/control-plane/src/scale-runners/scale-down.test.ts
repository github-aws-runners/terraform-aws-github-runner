import moment from 'moment';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import * as ghAuth from '../github/auth';
import { githubCache } from './cache';
import { newestFirstStrategy, oldestFirstStrategy, scaleDown } from './scale-down';
import { createScaleDownRunnerProvider, getDefaultScaleDownRunnerProviderType } from './scale-down-provider-registry';
import type { Octokit } from '@octokit/rest';
import type { RunnerInfo, RunnerList } from './scale-down-provider';

const testProvider = vi.hoisted(() => ({
  name: 'TestProvider',
  list: vi.fn(),
  bootTimeExceeded: vi.fn(),
  markOrphan: vi.fn(),
  unmarkOrphan: vi.fn(),
  terminate: vi.fn(),
}));

const mockOctokit = {
  apps: {
    getOrgInstallation: vi.fn(),
    getRepoInstallation: vi.fn(),
  },
  actions: {
    listSelfHostedRunnersForOrg: vi.fn(),
    listSelfHostedRunnersForRepo: vi.fn(),
    getSelfHostedRunnerForOrg: vi.fn(),
    getSelfHostedRunnerForRepo: vi.fn(),
  },
  paginate: vi.fn(),
};

vi.mock('../github/auth', async () => ({
  createGithubAppAuth: vi.fn(),
  createGithubInstallationAuth: vi.fn(),
  createOctokitClient: vi.fn(),
}));

vi.mock('./scale-down-provider-registry', () => ({
  createScaleDownRunnerProvider: vi.fn(() => testProvider),
  getDefaultScaleDownRunnerProviderType: vi.fn(() => 'test-provider'),
}));

const cleanEnv = process.env;
const mockedCreateGithubAppAuth = vi.mocked(ghAuth.createGithubAppAuth);
const mockedCreateGithubInstallationAuth = vi.mocked(ghAuth.createGithubInstallationAuth);
const mockedCreateOctokitClient = vi.mocked(ghAuth.createOctokitClient);
const mockedCreateScaleDownRunnerProvider = vi.mocked(createScaleDownRunnerProvider);
const mockedGetDefaultScaleDownRunnerProviderType = vi.mocked(getDefaultScaleDownRunnerProviderType);

function setDefaults() {
  process.env = { ...cleanEnv };
  process.env.GITHUB_APP_KEY_BASE64 = 'TEST_CERTIFICATE_DATA';
  process.env.GITHUB_APP_ID = '1337';
  process.env.GITHUB_APP_CLIENT_ID = 'TEST_CLIENT_ID';
  process.env.GITHUB_APP_CLIENT_SECRET = 'TEST_CLIENT_SECRET';
  process.env.SCALE_DOWN_CONFIG = '[]';
  process.env.ENVIRONMENT = 'unit-test-environment';
  process.env.MINIMUM_RUNNING_TIME_IN_MINUTES = '30';
  process.env.RUNNER_BOOT_TIME_IN_MINUTES = '5';
}

beforeEach(() => {
  vi.clearAllMocks();
  setDefaults();
  githubCache.clients.clear();
  githubCache.runners.clear();

  testProvider.list.mockResolvedValue([]);
  testProvider.bootTimeExceeded.mockReturnValue(false);
  testProvider.markOrphan.mockResolvedValue(undefined);
  testProvider.unmarkOrphan.mockResolvedValue(undefined);
  testProvider.terminate.mockResolvedValue(undefined);

  mockedCreateGithubAppAuth.mockResolvedValue({
    type: 'app',
    token: 'app-token',
    appId: 1,
    expiresAt: 'some-date',
  });
  mockedCreateGithubInstallationAuth.mockResolvedValue({
    type: 'token',
    tokenType: 'installation',
    token: 'installation-token',
    createdAt: 'some-date',
    expiresAt: 'some-date',
    permissions: {},
    repositorySelection: 'all',
    installationId: 2,
  });
  mockedCreateOctokitClient.mockResolvedValue(mockOctokit as unknown as Octokit);
  mockOctokit.apps.getOrgInstallation.mockResolvedValue({ data: { id: 2 } });
  mockOctokit.apps.getRepoInstallation.mockResolvedValue({ data: { id: 2 } });
  mockOctokit.paginate.mockResolvedValue([]);
});

describe('scaleDown runner provider orchestration', () => {
  it('creates the default provider and lists orphan and active runners', async () => {
    await scaleDown();

    expect(mockedGetDefaultScaleDownRunnerProviderType).toHaveBeenCalled();
    expect(mockedCreateScaleDownRunnerProvider).toHaveBeenCalledWith('test-provider');
    expect(testProvider.list).toHaveBeenNthCalledWith(1, 'unit-test-environment', true);
    expect(testProvider.list).toHaveBeenNthCalledWith(2, 'unit-test-environment');
    expect(testProvider.terminate).not.toHaveBeenCalled();
  });

  it('creates the provider type configured on idle config', async () => {
    process.env.SCALE_DOWN_CONFIG = JSON.stringify([
      {
        idleCount: 0,
        cron: '* * * * *',
        timeZone: 'UTC',
        type: 'custom-provider',
      },
    ]);

    await scaleDown();

    expect(mockedCreateScaleDownRunnerProvider).toHaveBeenCalledWith('custom-provider');
  });

  it('marks a provider runner as orphan when it is not registered and boot time is exceeded', async () => {
    const runner: RunnerInfo = {
      id: 'runner-1',
      launchTime: moment(new Date()).subtract(10, 'minutes').toDate(),
      owner: 'Codertocat',
      type: 'Org',
    };
    testProvider.list.mockImplementation(async (_environment: string, orphan?: boolean) => (orphan ? [] : [runner]));
    testProvider.bootTimeExceeded.mockReturnValue(true);

    await scaleDown();

    expect(testProvider.bootTimeExceeded).toHaveBeenCalledWith(runner);
    expect(testProvider.markOrphan).toHaveBeenCalledWith('runner-1');
    expect(testProvider.terminate).not.toHaveBeenCalledWith('runner-1');
  });

  it('terminates orphan runners through the selected provider', async () => {
    const orphanRunner: RunnerList = {
      id: 'orphan-1',
      launchTime: moment(new Date()).subtract(10, 'minutes').toDate(),
      owner: 'Codertocat',
      type: 'Org',
      orphan: true,
    };
    testProvider.list.mockImplementation(async (_environment: string, orphan?: boolean) =>
      orphan ? [orphanRunner] : [],
    );

    await scaleDown();

    expect(testProvider.terminate).toHaveBeenCalledWith('orphan-1');
  });
});

describe('scaleDown runner sort strategies', () => {
  const createRunners = (): RunnerInfo[] => [
    {
      id: '1',
      launchTime: moment(new Date()).subtract(1, 'minute').toDate(),
      owner: 'owner',
      type: 'type',
    },
    {
      id: '3',
      launchTime: moment(new Date()).subtract(3, 'minute').toDate(),
      owner: 'owner',
      type: 'type',
    },
    {
      id: '2',
      launchTime: moment(new Date()).subtract(2, 'minute').toDate(),
      owner: 'owner',
      type: 'type',
    },
    {
      id: '0',
      launchTime: moment(new Date()).subtract(0, 'minute').toDate(),
      owner: 'owner',
      type: 'type',
    },
  ];

  it('sorts runners descending for oldest first to keep the youngest', () => {
    const runners = createRunners();

    runners.sort(oldestFirstStrategy);
    expect(runners.map((runner) => runner.id)).toEqual(['0', '1', '2', '3']);
  });

  it('sorts runners ascending for newest first to keep the oldest', () => {
    const runners = createRunners();

    runners.sort(newestFirstStrategy);
    expect(runners.map((runner) => runner.id)).toEqual(['3', '2', '1', '0']);
  });
});
