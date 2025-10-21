import { RequestError } from '@octokit/request-error';
import { Octokit } from '@octokit/rest';
import moment from 'moment';
import nock from 'nock';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listEC2Runners, tag, terminateRunner, untag } from './../aws/runners';
import type { RunnerInfo, RunnerList } from '../aws/runners.d';
import * as ghAuth from '../github/auth';
import { githubCache } from './cache';
import { newestFirstStrategy, oldestFirstStrategy, scaleDown, scaleDownEnvironment } from './scale-down';
import {
  type EnvironmentScaleDownConfig,
  type EvictionStrategy,
  loadEnvironmentScaleDownConfigFromSsm,
} from './scale-down-config';

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
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(() => mockOctokit),
}));

vi.mock('./../aws/runners', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    tag: vi.fn(),
    untag: vi.fn(),
    terminateRunner: vi.fn(),
    listEC2Runners: vi.fn(),
  };
});
vi.mock('./../github/auth', async () => ({
  createGithubAppAuth: vi.fn(),
  createGithubInstallationAuth: vi.fn(),
  createOctokitClient: vi.fn(),
}));

vi.mock('./cache', async () => ({
  githubCache: {
    getRunner: vi.fn(),
    addRunner: vi.fn(),
    clients: new Map(),
    runners: new Map(),
    reset: vi.fn().mockImplementation(() => {
      githubCache.clients.clear();
      githubCache.runners.clear();
    }),
  },
}));

vi.mock('./scale-down-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./scale-down-config')>();
  return {
    ...actual,
    loadEnvironmentScaleDownConfigFromSsm: vi.fn(),
  };
});

const mocktokit = Octokit as vi.MockedClass<typeof Octokit>;
const mockedAppAuth = vi.mocked(ghAuth.createGithubAppAuth);
const mockedInstallationAuth = vi.mocked(ghAuth.createGithubInstallationAuth);
const mockCreateClient = vi.mocked(ghAuth.createOctokitClient);
const mockListRunners = vi.mocked(listEC2Runners);
const mockTagRunners = vi.mocked(tag);
const mockUntagRunners = vi.mocked(untag);
const mockTerminateRunners = vi.mocked(terminateRunner);
const mockLoadEnvironmentScaleDownConfigFromSsm = vi.mocked(loadEnvironmentScaleDownConfigFromSsm);

export interface TestData {
  repositoryName: string;
  repositoryOwner: string;
}

const cleanEnv = process.env;

const ENVIRONMENT = 'unit-test-environment';
const MINIMUM_TIME_RUNNING_IN_MINUTES = 30;
const MINIMUM_BOOT_TIME = 5;
const TEST_DATA: TestData = {
  repositoryName: 'hello-world',
  repositoryOwner: 'Codertocat',
};

const defaultEnvironmentConfig: EnvironmentScaleDownConfig = {
  environment: ENVIRONMENT,
  idle_config: [],
  minimum_running_time_in_minutes: MINIMUM_TIME_RUNNING_IN_MINUTES,
  runner_boot_time_in_minutes: MINIMUM_BOOT_TIME,
};

interface RunnerTestItem extends RunnerList {
  registered: boolean;
  orphan: boolean;
  shouldBeTerminated: boolean;
}

describe('Scale down runners', () => {
  beforeEach(() => {
    process.env = { ...cleanEnv };
    process.env.GITHUB_APP_KEY_BASE64 = 'TEST_CERTIFICATE_DATA';
    process.env.GITHUB_APP_ID = '1337';
    process.env.GITHUB_APP_CLIENT_ID = 'TEST_CLIENT_ID';
    process.env.GITHUB_APP_CLIENT_SECRET = 'TEST_CLIENT_SECRET';
    process.env.RUNNERS_MAXIMUM_COUNT = '3';

    nock.disableNetConnect();
    vi.clearAllMocks();
    vi.resetModules();
    githubCache.clients.clear();
    githubCache.runners.clear();
    mockLoadEnvironmentScaleDownConfigFromSsm.mockReset();
    mockLoadEnvironmentScaleDownConfigFromSsm.mockResolvedValue([defaultEnvironmentConfig]);
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
      // check if repo.runner_id contains the word "busy". If yes, throw an error else return 204
      if (repo.runner_id.includes('busy')) {
        throw Error();
      } else {
        return { status: 204 };
      }
    });

    mockOctokit.actions.deleteSelfHostedRunnerFromOrg.mockImplementation((repo) => {
      // check if repo.runner_id contains the word "busy". If yes, throw an error else return 204
      if (repo.runner_id.includes('busy')) {
        throw Error();
      } else {
        return { status: 204 };
      }
    });

    mockOctokit.actions.getSelfHostedRunnerForRepo.mockImplementation((repo) => {
      if (repo.runner_id.includes('busy')) {
        return {
          data: { busy: true },
        };
      } else {
        return {
          data: { busy: false },
        };
      }
    });
    mockOctokit.actions.getSelfHostedRunnerForOrg.mockImplementation((repo) => {
      if (repo.runner_id.includes('busy')) {
        return {
          data: { busy: true },
        };
      } else {
        return {
          data: { busy: false },
        };
      }
    });

    mockTerminateRunners.mockImplementation(async () => {
      return;
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
    mockCreateClient.mockResolvedValue(new mocktokit());
  });

  it('should handle empty environment configs gracefully', async () => {
    mockLoadEnvironmentScaleDownConfigFromSsm.mockResolvedValue([]);

    await expect(scaleDown()).resolves.not.toThrow();
    expect(mockListRunners).not.toHaveBeenCalled();
  });

  const endpoints = ['https://api.github.com', 'https://github.enterprise.something', 'https://companyname.ghe.com'];

  describe.each(endpoints)('for %s', (endpoint) => {
    beforeEach(() => {
      if (endpoint.includes('enterprise') || endpoint.endsWith('.ghe.com')) {
        process.env.GHES_URL = endpoint;
      }
    });

    type RunnerType = 'Repo' | 'Org';
    const runnerTypes: RunnerType[] = ['Org', 'Repo'];
    describe.each(runnerTypes)('For %s runners.', (type) => {
      it('Should not call terminate when no runners online.', async () => {
        // setup
        mockAwsRunners([]);

        // act
        await scaleDown();

        // assert
        expect(listEC2Runners).toHaveBeenCalledWith({
          environment: ENVIRONMENT,
        });
        expect(terminateRunner).not.toHaveBeenCalled();
        expect(mockOctokit.apps.getRepoInstallation).not.toHaveBeenCalled();
        expect(mockOctokit.apps.getRepoInstallation).not.toHaveBeenCalled();
      });

      it(`Should terminate runner without idle config ${type} runners.`, async () => {
        // setup
        const runners = [
          createRunnerTestData('idle-1', type, MINIMUM_TIME_RUNNING_IN_MINUTES - 1, true, false, false),
          createRunnerTestData('idle-2', type, MINIMUM_TIME_RUNNING_IN_MINUTES + 4, true, false, true),
          createRunnerTestData('busy-1', type, MINIMUM_TIME_RUNNING_IN_MINUTES + 3, true, false, false),
          createRunnerTestData('booting-1', type, MINIMUM_BOOT_TIME - 1, false, false, false),
        ];

        mockGitHubRunners(runners);
        mockListRunners.mockResolvedValue(runners);
        mockAwsRunners(runners);

        await scaleDown();

        // assert
        expect(listEC2Runners).toHaveBeenCalledWith({
          environment: ENVIRONMENT,
        });

        if (type === 'Repo') {
          expect(mockOctokit.apps.getRepoInstallation).toHaveBeenCalled();
        } else {
          expect(mockOctokit.apps.getOrgInstallation).toHaveBeenCalled();
        }

        checkTerminated(runners);
        checkNonTerminated(runners);
      });

      it(`Should respect idle runner with minimum running time not exceeded.`, async () => {
        // setup
        const runners = [createRunnerTestData('idle-1', type, MINIMUM_TIME_RUNNING_IN_MINUTES - 1, true, false, false)];

        mockGitHubRunners(runners);
        mockAwsRunners(runners);

        // act
        await scaleDown();

        // assert
        checkTerminated(runners);
        checkNonTerminated(runners);
      });

      it(`Should respect booting runner.`, async () => {
        // setup
        const runners = [createRunnerTestData('booting-1', type, MINIMUM_BOOT_TIME - 1, false, false, false)];

        mockGitHubRunners(runners);
        mockAwsRunners(runners);

        // act
        await scaleDown();

        // assert
        checkTerminated(runners);
        checkNonTerminated(runners);
      });

      it(`Should respect busy runner.`, async () => {
        // setup
        const runners = [createRunnerTestData('busy-1', type, MINIMUM_TIME_RUNNING_IN_MINUTES + 1, true, false, false)];

        mockGitHubRunners(runners);
        mockAwsRunners(runners);

        // act
        await scaleDown();

        // assert
        checkTerminated(runners);
        checkNonTerminated(runners);
      });

      it(`Should not terminate a runner that became busy just before deregister runner.`, async () => {
        // setup
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
        mockAwsRunners(runners);
        mockOctokit.actions.deleteSelfHostedRunnerFromRepo.mockImplementation(() => {
          return { status: 500 };
        });

        mockOctokit.actions.deleteSelfHostedRunnerFromOrg.mockImplementation(() => {
          return { status: 500 };
        });

        // act and ensure no exception is thrown
        await expect(scaleDown()).resolves.not.toThrow();

        // assert
        checkTerminated(runners);
        checkNonTerminated(runners);
      });

      it(`Should terminate orphan (Non JIT)`, async () => {
        // setup
        const orphanRunner = createRunnerTestData('orphan-1', type, MINIMUM_BOOT_TIME + 1, false, false, false);
        const idleRunner = createRunnerTestData('idle-1', type, MINIMUM_BOOT_TIME + 1, true, false, false);
        const runners = [orphanRunner, idleRunner];

        mockGitHubRunners([idleRunner]);
        mockAwsRunners(runners);

        // act
        await scaleDown();

        // assert
        checkTerminated(runners);
        checkNonTerminated(runners);

        expect(mockTagRunners).toHaveBeenCalledWith(orphanRunner.instanceId, [
          {
            Key: 'ghr:orphan',
            Value: 'true',
          },
        ]);

        expect(mockTagRunners).not.toHaveBeenCalledWith(idleRunner.instanceId, expect.anything());

        // next cycle, update test data set orphan to true and terminate should be true
        orphanRunner.orphan = true;
        orphanRunner.shouldBeTerminated = true;

        // act
        await scaleDown();

        // assert
        checkTerminated(runners);
        checkNonTerminated(runners);
      });

      it('Should test if orphaned runner, untag if online and busy, else terminate (JIT)', async () => {
        // arrange
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
        mockAwsRunners(runners);

        if (type === 'Repo') {
          mockOctokit.actions.getSelfHostedRunnerForRepo.mockResolvedValueOnce({
            data: {
              id: 1234567890,
              name: orphanRunner.instanceId,
              busy: true,
              status: 'online',
            },
          });
        } else {
          mockOctokit.actions.getSelfHostedRunnerForOrg.mockResolvedValueOnce({
            data: {
              id: 1234567890,
              name: orphanRunner.instanceId,
              busy: true,
              status: 'online',
            },
          });
        }

        // act
        await scaleDown();

        // assert
        expect(mockUntagRunners).toHaveBeenCalledWith(orphanRunner.instanceId, [{ Key: 'ghr:orphan', Value: 'true' }]);
        expect(mockTerminateRunners).not.toHaveBeenCalledWith(orphanRunner.instanceId);

        // arrange
        if (type === 'Repo') {
          mockOctokit.actions.getSelfHostedRunnerForRepo.mockResolvedValueOnce({
            data: {
              runnerId: 1234567890,
              name: orphanRunner.instanceId,
              busy: true,
              status: 'offline',
            },
          });
        } else {
          mockOctokit.actions.getSelfHostedRunnerForOrg.mockResolvedValueOnce({
            data: {
              runnerId: 1234567890,
              name: orphanRunner.instanceId,
              busy: true,
              status: 'offline',
            },
          });
        }

        // act
        await scaleDown();

        // assert
        expect(mockTerminateRunners).toHaveBeenCalledWith(orphanRunner.instanceId);
      });

      it('Should handle 404 error when checking orphaned runner (JIT) - treat as orphaned', async () => {
        // arrange
        const orphanRunner = createRunnerTestData(
          'orphan-jit-404',
          type,
          MINIMUM_BOOT_TIME + 1,
          false,
          true,
          true, // should be terminated when 404
          undefined,
          1234567890,
        );
        const runners = [orphanRunner];

        mockGitHubRunners([]);
        mockAwsRunners(runners);

        // Mock 404 error response
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

        // act
        await scaleDown();

        // assert - should terminate since 404 means runner doesn't exist on GitHub
        expect(mockTerminateRunners).toHaveBeenCalledWith(orphanRunner.instanceId);
      });

      it('Should handle 404 error when checking runner busy state - treat as not busy', async () => {
        // arrange
        const runner = createRunnerTestData(
          'runner-404',
          type,
          MINIMUM_TIME_RUNNING_IN_MINUTES + 1,
          true,
          false,
          true, // should be terminated since not busy due to 404
        );
        const runners = [runner];

        mockGitHubRunners(runners);
        mockAwsRunners(runners);

        // Mock 404 error response for busy state check
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

        // act
        await scaleDown();

        // assert - should terminate since 404 means runner is not busy
        checkTerminated(runners);
      });

      it('Should re-throw non-404 errors when checking runner state', async () => {
        // arrange
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
        mockAwsRunners(runners);

        // Mock non-404 error response
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

        // act & assert - should not throw because error handling is in terminateOrphan
        await expect(scaleDown()).resolves.not.toThrow();

        // Should not terminate since the error was not a 404
        expect(terminateRunner).not.toHaveBeenCalledWith(orphanRunner.instanceId);
      });

      it(`Should ignore errors when termination orphan fails.`, async () => {
        // setup
        const orphanRunner = createRunnerTestData('orphan-1', type, MINIMUM_BOOT_TIME + 1, false, true, true);
        const runners = [orphanRunner];

        mockGitHubRunners([]);
        mockAwsRunners(runners);
        mockTerminateRunners.mockImplementation(() => {
          throw new Error('Failed to terminate');
        });

        // act
        await scaleDown();

        // assert
        checkTerminated(runners);
        checkNonTerminated(runners);
      });

      describe('When orphan termination fails', () => {
        it(`Should not throw in case of list runner exception.`, async () => {
          // setup
          const runners = [createRunnerTestData('orphan-1', type, MINIMUM_BOOT_TIME + 1, false, true, true)];

          mockGitHubRunners([]);
          mockListRunners.mockRejectedValueOnce(new Error('Failed to list runners'));
          mockAwsRunners(runners);

          // ac
          await scaleDown();

          // assert
          checkNonTerminated(runners);
        });

        it(`Should not throw in case of terminate runner exception.`, async () => {
          // setup
          const runners = [createRunnerTestData('orphan-1', type, MINIMUM_BOOT_TIME + 1, false, true, true)];

          mockGitHubRunners([]);
          mockAwsRunners(runners);
          mockTerminateRunners.mockRejectedValue(new Error('Failed to terminate'));

          // act and ensure no exception is thrown
          await scaleDown();

          // assert
          checkNonTerminated(runners);
        });
      });

      it(`Should not terminate instance in case de-register fails.`, async () => {
        // setup
        const runners = [createRunnerTestData('idle-1', type, MINIMUM_TIME_RUNNING_IN_MINUTES + 1, true, false, false)];

        mockOctokit.actions.deleteSelfHostedRunnerFromOrg.mockImplementation(() => {
          return { status: 500 };
        });
        mockOctokit.actions.deleteSelfHostedRunnerFromRepo.mockImplementation(() => {
          return { status: 500 };
        });

        mockGitHubRunners(runners);
        mockAwsRunners(runners);

        // act and should resolve
        await expect(scaleDown()).resolves.not.toThrow();

        // assert
        checkTerminated(runners);
        checkNonTerminated(runners);
      });

      it(`Should not throw an exception in case of failure during removing a runner.`, async () => {
        // setup
        const runners = [createRunnerTestData('idle-1', type, MINIMUM_TIME_RUNNING_IN_MINUTES + 1, true, true, false)];

        mockOctokit.actions.deleteSelfHostedRunnerFromOrg.mockImplementation(() => {
          throw new Error('Failed to delete runner');
        });
        mockOctokit.actions.deleteSelfHostedRunnerFromRepo.mockImplementation(() => {
          throw new Error('Failed to delete runner');
        });

        mockGitHubRunners(runners);
        mockAwsRunners(runners);

        // act
        await expect(scaleDown()).resolves.not.toThrow();
      });

      const evictionStrategies: EvictionStrategy[] = ['oldest_first', 'newest_first'];
      describe.each(evictionStrategies)('When idle config defined', (evictionStrategy) => {
        const defaultConfig = {
          idleCount: 1,
          cron: '* * * * * *',
          timeZone: 'Europe/Amsterdam',
          evictionStrategy,
        };

        beforeEach(() => {
          mockLoadEnvironmentScaleDownConfigFromSsm.mockResolvedValue([
            {
              environment: ENVIRONMENT,
              idle_config: [defaultConfig],
              minimum_running_time_in_minutes: MINIMUM_TIME_RUNNING_IN_MINUTES,
              runner_boot_time_in_minutes: MINIMUM_BOOT_TIME,
            },
          ]);
        });

        it(`Should terminate based on the the idle config with ${evictionStrategy} eviction strategy`, async () => {
          // setup
          const runnerToTerminateTime =
            evictionStrategy === 'oldest_first'
              ? MINIMUM_TIME_RUNNING_IN_MINUTES + 5
              : MINIMUM_TIME_RUNNING_IN_MINUTES + 1;
          const runners = [
            createRunnerTestData('idle-1', type, MINIMUM_TIME_RUNNING_IN_MINUTES + 4, true, false, false),
            createRunnerTestData('idle-to-terminate', type, runnerToTerminateTime, true, false, true),
          ];

          mockGitHubRunners(runners);
          mockAwsRunners(runners);

          // act
          await scaleDown();

          // assert
          const runnersToTerminate = runners.filter((r) => r.shouldBeTerminated);
          for (const toTerminate of runnersToTerminate) {
            expect(terminateRunner).toHaveBeenCalledWith(toTerminate.instanceId);
          }

          const runnersNotToTerminate = runners.filter((r) => !r.shouldBeTerminated);
          for (const notTerminated of runnersNotToTerminate) {
            expect(terminateRunner).not.toHaveBeenCalledWith(notTerminated.instanceId);
          }
        });
      });
    });
  });

  describe('When runners are sorted', () => {
    const runners: RunnerInfo[] = [
      {
        instanceId: '1',
        launchTime: moment(new Date()).subtract(1, 'minute').toDate(),
        owner: 'owner',
        type: 'type',
      },
      {
        instanceId: '3',
        launchTime: moment(new Date()).subtract(3, 'minute').toDate(),
        owner: 'owner',
        type: 'type',
      },
      {
        instanceId: '2',
        launchTime: moment(new Date()).subtract(2, 'minute').toDate(),
        owner: 'owner',
        type: 'type',
      },
      {
        instanceId: '0',
        launchTime: moment(new Date()).subtract(0, 'minute').toDate(),
        owner: 'owner',
        type: 'type',
      },
    ];

    it('Should sort runners descending for eviction strategy oldest first te keep the youngest.', () => {
      runners.sort(oldestFirstStrategy);
      expect(runners[0].instanceId).toEqual('0');
      expect(runners[1].instanceId).toEqual('1');
      expect(runners[2].instanceId).toEqual('2');
      expect(runners[3].instanceId).toEqual('3');
    });

    it('Should sort runners ascending for eviction strategy newest first te keep oldest.', () => {
      runners.sort(newestFirstStrategy);
      expect(runners[0].instanceId).toEqual('3');
      expect(runners[1].instanceId).toEqual('2');
      expect(runners[2].instanceId).toEqual('1');
      expect(runners[3].instanceId).toEqual('0');
    });

    it('Should sort runners with equal launch time.', () => {
      const runnersTest = [...runners];
      const same = moment(new Date()).subtract(4, 'minute').toDate();
      runnersTest.push({
        instanceId: '4',
        launchTime: same,
        owner: 'owner',
        type: 'type',
      });
      runnersTest.push({
        instanceId: '5',
        launchTime: same,
        owner: 'owner',
        type: 'type',
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
          instanceId: '0',
          launchTime: undefined,
          owner: 'owner',
          type: 'type',
        },
        {
          instanceId: '1',
          launchTime: moment(new Date()).subtract(3, 'minute').toDate(),
          owner: 'owner',
          type: 'type',
        },
        {
          instanceId: '0',
          launchTime: undefined,
          owner: 'owner',
          type: 'type',
        },
      ];
      runnersTest.sort(oldestFirstStrategy);
      expect(runnersTest[0].launchTime).toBeUndefined();
      expect(runnersTest[1].launchTime).toBeDefined();
      expect(runnersTest[2].launchTime).not.toBeDefined();
    });
  });

  describe('Multi-environment scale-down', () => {
    it('Should process multiple environments independently', async () => {
      // setup - two environments with different settings
      const environment1 = 'env-1';
      const environment2 = 'env-2';
      const minTime1 = 10;
      const minTime2 = 20;

      mockLoadEnvironmentScaleDownConfigFromSsm.mockResolvedValue([
        {
          environment: environment1,
          idle_config: [],
          minimum_running_time_in_minutes: minTime1,
          runner_boot_time_in_minutes: MINIMUM_BOOT_TIME,
        },
        {
          environment: environment2,
          idle_config: [],
          minimum_running_time_in_minutes: minTime2,
          runner_boot_time_in_minutes: MINIMUM_BOOT_TIME,
        },
      ]);

      const runners1 = [
        createRunnerTestData('env1-runner-old', 'Org', minTime1 + 1, true, false, true, 'owner1'),
        createRunnerTestData('env1-runner-new', 'Org', minTime1 - 1, true, false, false, 'owner1'),
      ];

      const runners2 = [
        createRunnerTestData('env2-runner-old', 'Org', minTime2 + 1, true, false, true, 'owner2'),
        createRunnerTestData('env2-runner-new', 'Org', minTime2 - 1, true, false, false, 'owner2'),
      ];

      mockListRunners.mockImplementation(async (filter) => {
        const allRunners =
          filter?.environment === environment1 ? runners1 : filter?.environment === environment2 ? runners2 : [];
        // Filter by orphan flag if specified
        return allRunners.filter((r) => !filter?.orphan || r.orphan === filter.orphan);
      });

      // Mock GitHub API to return runners filtered by owner
      mockOctokit.paginate.mockImplementation((fn, params: any) => {
        const allRunners = [...runners1, ...runners2];
        return Promise.resolve(
          allRunners.filter((r) => r.owner === params.org).map((r) => ({ id: r.instanceId, name: r.instanceId })),
        );
      });

      // act
      await scaleDown();

      // assert - should have been called for both environments
      expect(listEC2Runners).toHaveBeenCalledWith({
        environment: environment1,
      });
      expect(listEC2Runners).toHaveBeenCalledWith({
        environment: environment2,
      });

      // env1 runner that exceeded minTime1 should be terminated
      expect(terminateRunner).toHaveBeenCalledWith(runners1[0].instanceId);
      // env1 runner that didn't exceed minTime1 should not be terminated
      expect(terminateRunner).not.toHaveBeenCalledWith(runners1[1].instanceId);

      // env2 runner that exceeded minTime2 should be terminated
      expect(terminateRunner).toHaveBeenCalledWith(runners2[0].instanceId);
      // env2 runner that didn't exceed minTime2 should not be terminated
      expect(terminateRunner).not.toHaveBeenCalledWith(runners2[1].instanceId);
    });

    it('Should use per-environment idle config', async () => {
      // setup - two environments with different idle configs
      const environment1 = 'env-1';
      const environment2 = 'env-2';

      const idleConfig1 = {
        cron: '* * * * * *',
        idleCount: 2,
        timeZone: 'UTC',
      };
      const idleConfig2 = {
        cron: '* * * * * *',
        idleCount: 0,
        timeZone: 'UTC',
      };

      mockLoadEnvironmentScaleDownConfigFromSsm.mockResolvedValue([
        {
          environment: environment1,
          idle_config: [idleConfig1],
          minimum_running_time_in_minutes: MINIMUM_TIME_RUNNING_IN_MINUTES,
          runner_boot_time_in_minutes: MINIMUM_BOOT_TIME,
        },
        {
          environment: environment2,
          idle_config: [idleConfig2],
          minimum_running_time_in_minutes: MINIMUM_TIME_RUNNING_IN_MINUTES,
          runner_boot_time_in_minutes: MINIMUM_BOOT_TIME,
        },
      ]);

      const runners1 = [
        createRunnerTestData('env1-idle-1', 'Org', MINIMUM_TIME_RUNNING_IN_MINUTES + 5, true, false, true, 'owner1'), // oldest - should terminate
        createRunnerTestData('env1-idle-2', 'Org', MINIMUM_TIME_RUNNING_IN_MINUTES + 4, true, false, false, 'owner1'), // middle - keep
        createRunnerTestData('env1-idle-3', 'Org', MINIMUM_TIME_RUNNING_IN_MINUTES + 3, true, false, false, 'owner1'), // newest - keep
      ];

      const runners2 = [
        createRunnerTestData('env2-idle-1', 'Org', MINIMUM_TIME_RUNNING_IN_MINUTES + 5, true, false, true, 'owner2'),
        createRunnerTestData('env2-idle-2', 'Org', MINIMUM_TIME_RUNNING_IN_MINUTES + 4, true, false, true, 'owner2'),
      ];

      mockListRunners.mockImplementation(async (filter) => {
        const allRunners =
          filter?.environment === environment1 ? runners1 : filter?.environment === environment2 ? runners2 : [];
        // Filter by orphan flag if specified
        return allRunners.filter((r) => !filter?.orphan || r.orphan === filter.orphan);
      });

      // Mock GitHub API to return runners filtered by owner
      mockOctokit.paginate.mockImplementation((fn, params: any) => {
        const allRunners = [...runners1, ...runners2];
        return Promise.resolve(
          allRunners.filter((r) => r.owner === params.org).map((r) => ({ id: r.instanceId, name: r.instanceId })),
        );
      });

      // act
      await scaleDown();

      // assert
      // env1 has idleCount=2, so terminate oldest, keep 2 newest
      expect(terminateRunner).toHaveBeenCalledWith(runners1[0].instanceId); // oldest - terminated
      expect(terminateRunner).not.toHaveBeenCalledWith(runners1[1].instanceId); // middle - kept
      expect(terminateRunner).not.toHaveBeenCalledWith(runners1[2].instanceId); // newest - kept

      // env2 has idleCount=0, so all idle runners should be terminated
      expect(terminateRunner).toHaveBeenCalledWith(runners2[0].instanceId);
      expect(terminateRunner).toHaveBeenCalledWith(runners2[1].instanceId);
    });
  });
});

function mockAwsRunners(runners: RunnerTestItem[]) {
  mockListRunners.mockImplementation(async (filter) => {
    return runners.filter((r) => !filter?.orphan || filter?.orphan === r.orphan);
  });
}

function checkNonTerminated(runners: RunnerTestItem[]) {
  const notTerminated = runners.filter((r) => !r.shouldBeTerminated);
  for (const toTerminate of notTerminated) {
    expect(terminateRunner).not.toHaveBeenCalledWith(toTerminate.instanceId);
  }
}

function checkTerminated(runners: RunnerTestItem[]) {
  const runnersToTerminate = runners.filter((r) => r.shouldBeTerminated);
  expect(terminateRunner).toHaveBeenCalledTimes(runnersToTerminate.length);
  for (const toTerminate of runnersToTerminate) {
    expect(terminateRunner).toHaveBeenCalledWith(toTerminate.instanceId);
  }
}

function mockGitHubRunners(runners: RunnerTestItem[]) {
  mockOctokit.paginate.mockResolvedValue(
    runners
      .filter((r) => r.registered)
      .map((r) => {
        return {
          id: r.instanceId,
          name: r.instanceId,
        };
      }),
  );
}

function createRunnerTestData(
  name: string,
  type: 'Org' | 'Repo',
  minutesLaunchedAgo: number,
  registered: boolean,
  orphan: boolean,
  shouldBeTerminated: boolean,
  owner?: string,
  runnerId?: number,
): RunnerTestItem {
  return {
    instanceId: `i-${name}-${type.toLowerCase()}`,
    launchTime: moment(new Date()).subtract(minutesLaunchedAgo, 'minutes').toDate(),
    type,
    owner: owner
      ? owner
      : type === 'Repo'
        ? `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`
        : `${TEST_DATA.repositoryOwner}`,
    registered,
    orphan,
    shouldBeTerminated,
    runnerId: runnerId !== undefined ? String(runnerId) : undefined,
  };
}
