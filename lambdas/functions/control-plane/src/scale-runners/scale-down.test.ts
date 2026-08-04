import { RequestError } from '@octokit/request-error';
import { Octokit } from '@octokit/rest';
import moment from 'moment';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as ghAuth from '../github/auth';
import { createScaleDownRunnerProvider } from '../runner-provider-registry';
import { githubCache } from './cache';
import { newestFirstStrategy, oldestFirstStrategy, scaleDown } from './scale-down';
import type { RunnerInfo, RunnerList } from './scale-down-provider';

const mockOctokit = {
  apps: {
    getOrgInstallation: vi.fn(),
    getRepoInstallation: vi.fn(),
  },
  actions: {
    listSelfHostedRunnersForRepo: vi.fn(),
    listSelfHostedRunnersForOrg: vi.fn(),
    deleteSelfHostedRunnerFromOrg: vi.fn(),
    deleteSelfHostedRunnerFromRepo: vi.fn(),
    getSelfHostedRunnerForOrg: vi.fn(),
    getSelfHostedRunnerForRepo: vi.fn(),
  },
  paginate: vi.fn(),
  request: vi.fn(),
};

vi.mock('../github/auth', () => ({
  createGithubAppAuth: vi.fn(),
  createGithubInstallationAuth: vi.fn(),
  createOctokitClient: vi.fn(),
  createEnterprisePATClient: vi.fn(),
}));

vi.mock('../runner-provider-registry', () => ({
  createScaleDownRunnerProvider: vi.fn(),
}));

vi.mock('./cache', () => ({
  githubCache: {
    clients: new Map(),
    runners: new Map(),
    reset: vi.fn(),
  },
}));

const mockedAppAuth = vi.mocked(ghAuth.createGithubAppAuth);
const mockedInstallationAuth = vi.mocked(ghAuth.createGithubInstallationAuth);
const mockedCreateClient = vi.mocked(ghAuth.createOctokitClient);
const mockedEnterprisePatClient = vi.mocked(ghAuth.createEnterprisePATClient);
const mockedCreateScaleDownRunnerProvider = vi.mocked(createScaleDownRunnerProvider);
const cleanEnv = process.env;

const mockProvider = {
  type: 'ec2',
  list: vi.fn(),
  bootTimeExceeded: vi.fn(),
  markOrphan: vi.fn(),
  unmarkOrphan: vi.fn(),
  terminate: vi.fn(),
};

function createRunner(id: string, launchMinutesAgo: number): RunnerInfo {
  return {
    id,
    launchTime: moment(new Date()).subtract(launchMinutesAgo, 'minutes').toDate(),
    owner: 'acme-enterprise',
    type: 'Enterprise',
    githubRunnerId: '123',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...cleanEnv };
  process.env.SCALE_DOWN_CONFIG = '[]';
  process.env.ENVIRONMENT = 'unit-test-environment';
  process.env.MINIMUM_RUNNING_TIME_IN_MINUTES = '30';
  process.env.RUNNER_BOOT_TIME_IN_MINUTES = '5';
  process.env.GHES_URL = 'https://ghe.example.com';
  mockedCreateScaleDownRunnerProvider.mockReturnValue(mockProvider as never);
  mockedAppAuth.mockResolvedValue({ token: 'app-token' } as never);
  mockedInstallationAuth.mockResolvedValue({ token: 'installation-token' } as never);
  mockedCreateClient.mockResolvedValue(mockOctokit as unknown as Octokit);
  mockedEnterprisePatClient.mockResolvedValue(mockOctokit as unknown as Octokit);
  mockProvider.list.mockResolvedValue([]);
  mockProvider.bootTimeExceeded.mockReturnValue(true);
  mockProvider.markOrphan.mockResolvedValue(undefined);
  mockProvider.unmarkOrphan.mockResolvedValue(undefined);
  mockProvider.terminate.mockResolvedValue(undefined);
  mockOctokit.paginate.mockResolvedValue([]);
  mockOctokit.request.mockReset();
  mockOctokit.request.mockResolvedValue({ data: { busy: false, status: 'online' }, status: 204, headers: {} });
  githubCache.clients.clear();
  githubCache.runners.clear();
});

describe('When runners are sorted', () => {
  const runners: RunnerInfo[] = [
    { id: '1', launchTime: moment(new Date()).subtract(1, 'minute').toDate(), owner: 'owner', type: 'type' },
    { id: '3', launchTime: moment(new Date()).subtract(3, 'minute').toDate(), owner: 'owner', type: 'type' },
    { id: '2', launchTime: moment(new Date()).subtract(2, 'minute').toDate(), owner: 'owner', type: 'type' },
    { id: '0', launchTime: moment(new Date()).subtract(0, 'minute').toDate(), owner: 'owner', type: 'type' },
  ];

  it('Should sort runners descending for eviction strategy oldest first te keep the youngest.', () => {
    runners.sort(oldestFirstStrategy);
    expect(runners[0].id).toEqual('0');
    expect(runners[1].id).toEqual('1');
    expect(runners[2].id).toEqual('2');
    expect(runners[3].id).toEqual('3');
  });

  it('Should sort runners ascending for eviction strategy newest first te keep oldest.', () => {
    runners.sort(newestFirstStrategy);
    expect(runners[0].id).toEqual('3');
    expect(runners[1].id).toEqual('2');
    expect(runners[2].id).toEqual('1');
    expect(runners[3].id).toEqual('0');
  });
});

describe('enterprise scale-down', () => {
  beforeEach(() => {
    process.env.RUNNER_REGISTRATION_LEVEL = 'enterprise';
  });

  it('uses PAT auth and enterprise endpoints to terminate an idle runner', async () => {
    const runner = createRunner('i-enterprise-idle', 40);
    mockProvider.list.mockImplementation(async (_env: string, orphan?: boolean) => (orphan ? [] : [runner]));
    mockOctokit.paginate.mockResolvedValue([{ id: 123, name: 'prefix-i-enterprise-idle' }]);
    mockOctokit.request.mockImplementation(async (route: string) => {
      if (route.startsWith('GET')) {
        return { data: { busy: false, status: 'online' }, headers: {} };
      }
      return { status: 204, headers: {} };
    });

    await scaleDown();

    expect(mockedEnterprisePatClient).toHaveBeenCalledWith('https://ghe.example.com/api/v3');
    expect(mockedAppAuth).not.toHaveBeenCalled();
    expect(mockOctokit.paginate).toHaveBeenCalledWith('GET /enterprises/{enterprise}/actions/runners', {
      enterprise: 'acme-enterprise',
      per_page: 100,
    });
    expect(mockOctokit.request).toHaveBeenCalledWith('DELETE /enterprises/{enterprise}/actions/runners/{runner_id}', {
      enterprise: 'acme-enterprise',
      runner_id: 123,
    });
    expect(mockProvider.terminate).toHaveBeenCalledWith('i-enterprise-idle');
  });

  it('does not terminate the provider runner when enterprise deregistration fails', async () => {
    const runner = createRunner('i-enterprise-idle', 40);
    mockProvider.list.mockImplementation(async (_env: string, orphan?: boolean) => (orphan ? [] : [runner]));
    mockOctokit.paginate.mockResolvedValue([{ id: 123, name: 'i-enterprise-idle' }]);
    mockOctokit.request.mockImplementation(async (route: string) => {
      if (route.startsWith('GET')) {
        return { data: { busy: false, status: 'online' }, headers: {} };
      }
      throw new Error('delete failed');
    });

    await scaleDown();

    expect(mockProvider.terminate).not.toHaveBeenCalled();
  });

  it('treats a missing enterprise runner as orphaned during the last-chance check', async () => {
    const runner = createRunner('i-enterprise-idle', 40) as RunnerList;
    runner.orphan = true;
    runner.githubRunnerId = '123';
    mockProvider.list.mockImplementation(async (_env: string, orphan?: boolean) => (orphan ? [runner] : []));
    const notFound = new RequestError('not found', 404, {
      request: { method: 'GET', url: 'https://ghe.example.com/test', headers: {} },
    });
    mockOctokit.request.mockRejectedValue(notFound);

    await scaleDown();

    expect(mockProvider.terminate).toHaveBeenCalledWith('i-enterprise-idle');
  });
});
