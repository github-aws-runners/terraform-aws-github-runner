import type { Octokit } from '@octokit/rest';
import { RequestError } from '@octokit/request-error';
import moment from 'moment';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { controlPlaneProviderRegistry } from '../control-plane-providers';
import * as ghAuth from '../github/auth';
import { githubCache } from './cache';
import { newestFirstStrategy, oldestFirstStrategy, scaleDown } from './scale-down';
import type { RunnerInfo, RunnerType, ScaleDownRunnerProvider } from './types';

vi.mock('../github/auth', () => ({
  createGithubAppAuth: vi.fn(),
  createGithubInstallationAuth: vi.fn(),
  createOctokitClient: vi.fn(),
}));

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
};

const mockRunnerProvider = {
  type: 'ec2',
  list: vi.fn(),
  bootTimeExceeded: vi.fn(),
  markOrphan: vi.fn(),
  unmarkOrphan: vi.fn(),
  terminate: vi.fn(),
} satisfies ScaleDownRunnerProvider;

const mockedResolveCapability = vi.spyOn(controlPlaneProviderRegistry, 'capability');
const mockedAppAuth = vi.mocked(ghAuth.createGithubAppAuth);
const mockedInstallationAuth = vi.mocked(ghAuth.createGithubInstallationAuth);
const mockCreateClient = vi.mocked(ghAuth.createOctokitClient);
const mockListRunners = vi.mocked(mockRunnerProvider.list);
const mockBootTimeExceeded = vi.mocked(mockRunnerProvider.bootTimeExceeded);
const mockMarkOrphan = vi.mocked(mockRunnerProvider.markOrphan);
const mockUnmarkOrphan = vi.mocked(mockRunnerProvider.unmarkOrphan);
const mockTerminateRunners = vi.mocked(mockRunnerProvider.terminate);

const cleanEnv = process.env;

const ENVIRONMENT = 'unit-test-environment';
const MINIMUM_TIME_RUNNING_IN_MINUTES = 30;
const MINIMUM_BOOT_TIME = 5;
const TEST_DATA = {
  repositoryName: 'hello-world',
  repositoryOwner: 'Codertocat',
};

interface RunnerTestItem extends RunnerInfo {
  registered: boolean;
  orphan: boolean;
  shouldBeTerminated: boolean;
}

describe('When runners are sorted', () => {
  const runners: RunnerInfo[] = [
    {
      id: '1',
      launchTime: moment(new Date()).subtract(1, 'minute').toDate(),
      owner: 'owner',
      type: 'Org',
    },
    {
      id: '3',
      launchTime: moment(new Date()).subtract(3, 'minute').toDate(),
      owner: 'owner',
      type: 'Org',
    },
    {
      id: '2',
      launchTime: moment(new Date()).subtract(2, 'minute').toDate(),
      owner: 'owner',
      type: 'Org',
    },
    {
      id: '0',
      launchTime: moment(new Date()).subtract(0, 'minute').toDate(),
      owner: 'owner',
      type: 'Org',
    },
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

  it('Should sort runners with equal launch time.', () => {
    const runnersTest = [...runners];
    const same = moment(new Date()).subtract(4, 'minute').toDate();
    runnersTest.push({
      id: '4',
      launchTime: same,
      owner: 'owner',
      type: 'Org',
    });
    runnersTest.push({
      id: '5',
      launchTime: same,
      owner: 'owner',
      type: 'Org',
    });
    runnersTest.sort(oldestFirstStrategy);
    expect(runnersTest[3].launchTime).not.toEqual(same);
    expect(runnersTest[4].launchTime).toEqual(same);
    expect(runnersTest[5].launchTime).toEqual(same);

    runnersTest.sort(newestFirstStrategy);
    expect(runnersTest[3].launchTime).not.toEqual(same);
    expect(runnersTest[1].launchTime).toEqual(same);
    expect(runnersTest[0].launchTime).toEqual(same);
  });

  it('Should sort runners even when launch time is undefined.', () => {
    const runnersTest = [
      {
        id: '0',
        launchTime: undefined,
        owner: 'owner',
        type: 'Org',
      },
      {
        id: '1',
        launchTime: moment(new Date()).subtract(3, 'minute').toDate(),
        owner: 'owner',
        type: 'Org',
      },
      {
        id: '0',
        launchTime: undefined,
        owner: 'owner',
        type: 'Org',
      },
    ];
    runnersTest.sort(oldestFirstStrategy);
    expect(runnersTest[0].launchTime).toBeUndefined();
    expect(runnersTest[1].launchTime).toBeDefined();
    expect(runnersTest[2].launchTime).not.toBeDefined();
  });
});

describe('Scale down runners', () => {
  beforeEach(() => {
    process.env = { ...cleanEnv };
    process.env.GITHUB_APP_KEY_BASE64 = 'TEST_CERTIFICATE_DATA';
    process.env.GITHUB_APP_ID = '1337';
    process.env.GITHUB_APP_CLIENT_ID = 'TEST_CLIENT_ID';
    process.env.GITHUB_APP_CLIENT_SECRET = 'TEST_CLIENT_SECRET';
    process.env.RUNNERS_MAXIMUM_COUNT = '3';
    process.env.SCALE_DOWN_CONFIG = '[]';
    process.env.ENVIRONMENT = ENVIRONMENT;
    process.env.MINIMUM_RUNNING_TIME_IN_MINUTES = MINIMUM_TIME_RUNNING_IN_MINUTES.toString();
    process.env.RUNNER_BOOT_TIME_IN_MINUTES = MINIMUM_BOOT_TIME.toString();
    process.env.RUNNER_PROVIDER_TYPE = mockRunnerProvider.type;

    vi.clearAllMocks();
    githubCache.clients.clear();
    githubCache.runners.clear();

    mockedResolveCapability.mockReturnValue(() => mockRunnerProvider);
    mockBootTimeExceeded.mockImplementation((runner) => {
      const launchTimePlusBootTime = moment(runner.launchTime).utc().add(MINIMUM_BOOT_TIME, 'minutes');
      return launchTimePlusBootTime < moment(new Date()).utc();
    });
    mockMarkOrphan.mockResolvedValue();
    mockUnmarkOrphan.mockResolvedValue();
    mockTerminateRunners.mockResolvedValue();

    mockOctokit.apps.getOrgInstallation.mockImplementation(() => ({
      data: {
        id: 'ORG',
      },
    }));
    mockOctokit.apps.getRepoInstallation.mockImplementation(() => ({
      data: {
        id: 'REPO',
      },
    }));

    mockOctokit.paginate.mockResolvedValue([]);
    mockOctokit.actions.deleteSelfHostedRunnerFromRepo.mockImplementation((repo) => {
      if (repo.runner_id.includes('busy')) {
        throw Error();
      }
      return { status: 204 };
    });

    mockOctokit.actions.deleteSelfHostedRunnerFromOrg.mockImplementation((repo) => {
      if (repo.runner_id.includes('busy')) {
        throw Error();
      }
      return { status: 204 };
    });

    mockOctokit.actions.getSelfHostedRunnerForRepo.mockImplementation((repo) => {
      if (repo.runner_id.includes('busy')) {
        return {
          data: { busy: true },
        };
      }
      return {
        data: { busy: false },
      };
    });
    mockOctokit.actions.getSelfHostedRunnerForOrg.mockImplementation((repo) => {
      if (repo.runner_id.includes('busy')) {
        return {
          data: { busy: true },
        };
      }
      return {
        data: { busy: false },
      };
    });

    mockedAppAuth.mockResolvedValue({
      type: 'app',
      token: 'token',
      appId: 1,
      expiresAt: 'some-date',
    });
    mockedInstallationAuth.mockResolvedValue({
      type: 'token',
      tokenType: 'installation',
      token: 'token',
      createdAt: 'some-date',
      expiresAt: 'some-date',
      permissions: {},
      repositorySelection: 'all',
      installationId: 0,
    });
    mockCreateClient.mockResolvedValue(mockOctokit as unknown as Octokit);
  });

  const endpoints = ['https://api.github.com', 'https://github.enterprise.something', 'https://companyname.ghe.com'];

  describe.each(endpoints)('for %s', (endpoint) => {
    beforeEach(() => {
      if (endpoint.includes('enterprise') || endpoint.endsWith('.ghe.com')) {
        process.env.GHES_URL = endpoint;
      }
    });

    const runnerTypes: RunnerType[] = ['Org', 'Repo'];
    describe.each(runnerTypes)('For %s runners.', (type) => {
      it(`Should terminate runner without idle config ${type} runners.`, async () => {
        const runners = [
          createRunnerTestData('idle-1', type, MINIMUM_TIME_RUNNING_IN_MINUTES - 1, true, false, false),
          createRunnerTestData('idle-2', type, MINIMUM_TIME_RUNNING_IN_MINUTES + 4, true, false, true),
          createRunnerTestData('busy-1', type, MINIMUM_TIME_RUNNING_IN_MINUTES + 3, true, false, false),
          createRunnerTestData('booting-1', type, MINIMUM_BOOT_TIME - 1, false, false, false),
        ];

        mockGitHubRunners(runners);
        mockProviderRunners(runners);

        await scaleDown();

        expect(mockListRunners).toHaveBeenCalledWith(ENVIRONMENT);

        if (type === 'Repo') {
          expect(mockOctokit.apps.getRepoInstallation).toHaveBeenCalled();
        } else {
          expect(mockOctokit.apps.getOrgInstallation).toHaveBeenCalled();
        }

        checkTerminated(runners);
        checkNonTerminated(runners);
      });

      it(`Should respect idle runner with minimum running time not exceeded.`, async () => {
        const runners = [createRunnerTestData('idle-1', type, MINIMUM_TIME_RUNNING_IN_MINUTES - 1, true, false, false)];

        mockGitHubRunners(runners);
        mockProviderRunners(runners);

        await scaleDown();

        checkTerminated(runners);
        checkNonTerminated(runners);
      });

      it(`Should respect busy runner.`, async () => {
        const runners = [createRunnerTestData('busy-1', type, MINIMUM_TIME_RUNNING_IN_MINUTES + 1, true, false, false)];

        mockGitHubRunners(runners);
        mockProviderRunners(runners);

        await scaleDown();

        checkTerminated(runners);
        checkNonTerminated(runners);
      });

      it(`Should not terminate runner with bypass-removal tag set.`, async () => {
        const runners = [
          createRunnerTestData('idle-with-bypass', type, MINIMUM_TIME_RUNNING_IN_MINUTES + 10, true, false, false),
        ];
        runners[0].bypassRemoval = true;

        mockGitHubRunners(runners);
        mockProviderRunners(runners);

        await scaleDown();

        expect(mockTerminateRunners).not.toHaveBeenCalled();
        checkNonTerminated(runners);
      });

      it(`Should not terminate orphaned runner with bypass-removal tag set.`, async () => {
        const orphanRunner = createRunnerTestData('orphan-bypass', type, MINIMUM_BOOT_TIME + 1, false, false, false);
        orphanRunner.bypassRemoval = true;

        const idleRunner = createRunnerTestData('idle-1', type, MINIMUM_BOOT_TIME + 1, true, false, false);
        const runners = [orphanRunner, idleRunner];

        mockGitHubRunners([idleRunner]);
        mockProviderRunners(runners);

        await scaleDown();

        orphanRunner.orphan = true;

        await scaleDown();

        expect(mockTerminateRunners).not.toHaveBeenCalledWith(orphanRunner.id);
      });

      it(`Should not terminate a runner that became busy just before deregister runner.`, async () => {
        const runners = [
          createRunnerTestData(
            'job-just-start-at-deregister-1',
            type,
            MINIMUM_TIME_RUNNING_IN_MINUTES + 1,
            true,
            false,
            false,
          ),
        ];

        mockGitHubRunners(runners);
        mockProviderRunners(runners);
        mockOctokit.actions.deleteSelfHostedRunnerFromRepo.mockImplementation(() => {
          return { status: 500 };
        });

        mockOctokit.actions.deleteSelfHostedRunnerFromOrg.mockImplementation(() => {
          return { status: 500 };
        });

        await expect(scaleDown()).resolves.not.toThrow();

        checkTerminated(runners);
        checkNonTerminated(runners);
      });

      it(`Should terminate orphan (Non JIT)`, async () => {
        const orphanRunner = createRunnerTestData('orphan-1', type, MINIMUM_BOOT_TIME + 1, false, false, false);
        const idleRunner = createRunnerTestData('idle-1', type, MINIMUM_BOOT_TIME + 1, true, false, false);
        const runners = [orphanRunner, idleRunner];

        mockGitHubRunners([idleRunner]);
        mockProviderRunners(runners);

        await scaleDown();

        checkTerminated(runners);
        checkNonTerminated(runners);

        expect(mockMarkOrphan).toHaveBeenCalledWith(orphanRunner.id);
        expect(mockMarkOrphan).not.toHaveBeenCalledWith(idleRunner.id);

        orphanRunner.orphan = true;
        orphanRunner.shouldBeTerminated = true;

        await scaleDown();

        checkTerminated(runners);
        checkNonTerminated(runners);
      });

      it('Should test if orphaned runner, untag if online and busy, else terminate (JIT)', async () => {
        const orphanRunner = createRunnerTestData(
          'orphan-jit',
          type,
          MINIMUM_BOOT_TIME + 1,
          false,
          true,
          false,
          undefined,
          1234567890,
        );
        const runners = [orphanRunner];

        mockGitHubRunners([]);
        mockProviderRunners(runners);

        if (type === 'Repo') {
          mockOctokit.actions.getSelfHostedRunnerForRepo.mockResolvedValueOnce({
            data: { id: 1234567890, name: orphanRunner.id, busy: true, status: 'online' },
          });
        } else {
          mockOctokit.actions.getSelfHostedRunnerForOrg.mockResolvedValueOnce({
            data: { id: 1234567890, name: orphanRunner.id, busy: true, status: 'online' },
          });
        }

        await scaleDown();

        expect(mockUnmarkOrphan).toHaveBeenCalledWith(orphanRunner.id);
        expect(mockTerminateRunners).not.toHaveBeenCalledWith(orphanRunner.id);

        if (type === 'Repo') {
          mockOctokit.actions.getSelfHostedRunnerForRepo.mockResolvedValueOnce({
            data: { runnerId: 1234567890, name: orphanRunner.id, busy: true, status: 'offline' },
          });
        } else {
          mockOctokit.actions.getSelfHostedRunnerForOrg.mockResolvedValueOnce({
            data: { runnerId: 1234567890, name: orphanRunner.id, busy: true, status: 'offline' },
          });
        }

        await scaleDown();

        expect(mockTerminateRunners).toHaveBeenCalledWith(orphanRunner.id);
      });

      it('Should handle 404 error when checking orphaned runner (JIT) - treat as orphaned', async () => {
        const orphanRunner = createRunnerTestData(
          'orphan-jit-404',
          type,
          MINIMUM_BOOT_TIME + 1,
          false,
          true,
          true,
          undefined,
          1234567890,
        );
        const runners = [orphanRunner];

        mockGitHubRunners([]);
        mockProviderRunners(runners);

        const error404 = new RequestError('Runner not found', 404, {
          request: {
            method: 'GET',
            url: 'https://api.github.com/test',
            headers: {},
          },
        });

        if (type === 'Repo') {
          mockOctokit.actions.getSelfHostedRunnerForRepo.mockRejectedValueOnce(error404);
        } else {
          mockOctokit.actions.getSelfHostedRunnerForOrg.mockRejectedValueOnce(error404);
        }

        await scaleDown();

        expect(mockTerminateRunners).toHaveBeenCalledWith(orphanRunner.id);
      });

      it('Should handle 404 error when checking runner busy state - treat as not busy', async () => {
        const runner = createRunnerTestData('runner-404', type, MINIMUM_TIME_RUNNING_IN_MINUTES + 1, true, false, true);
        const runners = [runner];

        mockGitHubRunners(runners);
        mockProviderRunners(runners);

        const error404 = new RequestError('Runner not found', 404, {
          request: {
            method: 'GET',
            url: 'https://api.github.com/test',
            headers: {},
          },
        });

        if (type === 'Repo') {
          mockOctokit.actions.getSelfHostedRunnerForRepo.mockRejectedValueOnce(error404);
        } else {
          mockOctokit.actions.getSelfHostedRunnerForOrg.mockRejectedValueOnce(error404);
        }

        await scaleDown();

        checkTerminated(runners);
      });

      it('Should re-throw non-404 errors when checking runner state', async () => {
        const orphanRunner = createRunnerTestData(
          'orphan-error',
          type,
          MINIMUM_BOOT_TIME + 1,
          false,
          true,
          false,
          undefined,
          1234567890,
        );
        const runners = [orphanRunner];

        mockGitHubRunners([]);
        mockProviderRunners(runners);

        const error500 = new RequestError('Internal server error', 500, {
          request: {
            method: 'GET',
            url: 'https://api.github.com/test',
            headers: {},
          },
        });

        if (type === 'Repo') {
          mockOctokit.actions.getSelfHostedRunnerForRepo.mockRejectedValueOnce(error500);
        } else {
          mockOctokit.actions.getSelfHostedRunnerForOrg.mockRejectedValueOnce(error500);
        }

        await expect(scaleDown()).resolves.not.toThrow();

        expect(mockTerminateRunners).not.toHaveBeenCalledWith(orphanRunner.id);
      });

      it(`Should ignore errors when termination orphan fails.`, async () => {
        const orphanRunner = createRunnerTestData('orphan-1', type, MINIMUM_BOOT_TIME + 1, false, true, true);
        const runners = [orphanRunner];

        mockGitHubRunners([]);
        mockProviderRunners(runners);
        mockTerminateRunners.mockImplementation(() => {
          throw new Error('Failed to terminate');
        });

        await scaleDown();

        checkTerminated(runners);
        checkNonTerminated(runners);
      });

      describe('When orphan termination fails', () => {
        it(`Should not throw in case of list runner exception.`, async () => {
          const runners = [createRunnerTestData('orphan-1', type, MINIMUM_BOOT_TIME + 1, false, true, true)];

          mockGitHubRunners([]);
          mockProviderRunners(runners);
          mockListRunners.mockRejectedValueOnce(new Error('Failed to list runners'));

          await scaleDown();

          checkNonTerminated(runners);
        });

        it(`Should not throw in case of terminate runner exception.`, async () => {
          const runners = [createRunnerTestData('orphan-1', type, MINIMUM_BOOT_TIME + 1, false, true, true)];

          mockGitHubRunners([]);
          mockProviderRunners(runners);
          mockTerminateRunners.mockRejectedValue(new Error('Failed to terminate'));

          await scaleDown();

          checkNonTerminated(runners);
        });
      });

      it(`Should not terminate instance in case de-register fails.`, async () => {
        const runners = [createRunnerTestData('idle-1', type, MINIMUM_TIME_RUNNING_IN_MINUTES + 1, true, false, false)];

        mockOctokit.actions.deleteSelfHostedRunnerFromOrg.mockImplementation(() => {
          return { status: 500 };
        });
        mockOctokit.actions.deleteSelfHostedRunnerFromRepo.mockImplementation(() => {
          return { status: 500 };
        });

        mockGitHubRunners(runners);
        mockProviderRunners(runners);

        await expect(scaleDown()).resolves.not.toThrow();

        checkTerminated(runners);
        checkNonTerminated(runners);
      });

      it(`Should not throw an exception in case of failure during removing a runner.`, async () => {
        const runners = [createRunnerTestData('idle-1', type, MINIMUM_TIME_RUNNING_IN_MINUTES + 1, true, true, false)];

        mockOctokit.actions.deleteSelfHostedRunnerFromOrg.mockImplementation(() => {
          throw new Error('Failed to delete runner');
        });
        mockOctokit.actions.deleteSelfHostedRunnerFromRepo.mockImplementation(() => {
          throw new Error('Failed to delete runner');
        });

        mockGitHubRunners(runners);
        mockProviderRunners(runners);

        await expect(scaleDown()).resolves.not.toThrow();
      });

      it(`Should not terminate instance when de-registration throws an error.`, async () => {
        const runners = [createRunnerTestData('idle-1', type, MINIMUM_TIME_RUNNING_IN_MINUTES + 1, true, false, false)];

        const error502 = new RequestError('Server Error', 502, {
          request: {
            method: 'DELETE',
            url: 'https://api.github.com/test',
            headers: {},
          },
        });

        mockOctokit.actions.deleteSelfHostedRunnerFromOrg.mockImplementation(() => {
          throw error502;
        });
        mockOctokit.actions.deleteSelfHostedRunnerFromRepo.mockImplementation(() => {
          throw error502;
        });

        mockGitHubRunners(runners);
        mockProviderRunners(runners);

        await expect(scaleDown()).resolves.not.toThrow();

        expect(mockTerminateRunners).not.toHaveBeenCalled();
      });

      const evictionStrategies = ['oldest_first', 'newest_first'];
      describe.each(evictionStrategies)('When idle config defined', (evictionStrategy) => {
        const defaultConfig = {
          idleCount: 1,
          cron: '* * * * * *',
          timeZone: 'Europe/Amsterdam',
          evictionStrategy,
        };

        beforeEach(() => {
          process.env.SCALE_DOWN_CONFIG = JSON.stringify([defaultConfig]);
        });

        it(`Should terminate based on the the idle config with ${evictionStrategy} eviction strategy`, async () => {
          const runnerToTerminateTime =
            evictionStrategy === 'oldest_first'
              ? MINIMUM_TIME_RUNNING_IN_MINUTES + 5
              : MINIMUM_TIME_RUNNING_IN_MINUTES + 1;
          const runners = [
            createRunnerTestData('idle-1', type, MINIMUM_TIME_RUNNING_IN_MINUTES + 4, true, false, false),
            createRunnerTestData('idle-to-terminate', type, runnerToTerminateTime, true, false, true),
          ];

          mockGitHubRunners(runners);
          mockProviderRunners(runners);

          await scaleDown();

          const runnersToTerminate = runners.filter((runner) => runner.shouldBeTerminated);
          for (const toTerminate of runnersToTerminate) {
            expect(mockTerminateRunners).toHaveBeenCalledWith(toTerminate.id);
          }

          const runnersNotToTerminate = runners.filter((runner) => !runner.shouldBeTerminated);
          for (const notTerminated of runnersNotToTerminate) {
            expect(mockTerminateRunners).not.toHaveBeenCalledWith(notTerminated.id);
          }
        });
      });
    });
  });
});

function mockProviderRunners(runners: RunnerTestItem[]) {
  mockListRunners.mockImplementation(async (_environment, orphan) => {
    return runners.filter((runner) => !orphan || orphan === runner.orphan);
  });
}

function checkNonTerminated(runners: RunnerTestItem[]) {
  const notTerminated = runners.filter((runner) => !runner.shouldBeTerminated);
  for (const runner of notTerminated) {
    expect(mockTerminateRunners).not.toHaveBeenCalledWith(runner.id);
  }
}

function checkTerminated(runners: RunnerTestItem[]) {
  const runnersToTerminate = runners.filter((runner) => runner.shouldBeTerminated);
  expect(mockTerminateRunners).toHaveBeenCalledTimes(runnersToTerminate.length);
  for (const runner of runnersToTerminate) {
    expect(mockTerminateRunners).toHaveBeenCalledWith(runner.id);
  }
}

function mockGitHubRunners(runners: RunnerTestItem[]) {
  mockOctokit.paginate.mockResolvedValue(
    runners
      .filter((runner) => runner.registered)
      .map((runner) => {
        return {
          id: runner.id,
          name: runner.id,
        };
      }),
  );
}

function createRunnerTestData(
  name: string,
  type: RunnerType,
  minutesLaunchedAgo: number,
  registered: boolean,
  orphan: boolean,
  shouldBeTerminated: boolean,
  owner?: string,
  runnerId?: number,
): RunnerTestItem {
  return {
    id: `i-${name}-${type.toLowerCase()}`,
    launchTime: moment(new Date()).subtract(minutesLaunchedAgo, 'minutes').toDate(),
    type,
    owner:
      owner ??
      (type === 'Repo' ? `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}` : `${TEST_DATA.repositoryOwner}`),
    registered,
    orphan,
    shouldBeTerminated,
    githubRunnerId: runnerId !== undefined ? String(runnerId) : undefined,
    bypassRemoval: false,
  };
}
