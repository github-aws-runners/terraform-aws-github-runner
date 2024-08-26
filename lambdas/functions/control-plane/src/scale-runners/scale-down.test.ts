import { Octokit } from '@octokit/rest';
import { mocked } from 'jest-mock';
import moment from 'moment';
import nock from 'nock';

import { RunnerInfo, RunnerList } from '../aws/runners.d';
import * as ghAuth from '../github/auth';
import { listEC2Runners, terminateRunner, tag } from './../aws/runners';
import { githubCache } from './cache';
import { newestFirstStrategy, oldestFirstStrategy, scaleDown } from './scale-down';

const mockOctokit = {
  apps: {
    getOrgInstallation: jest.fn(),
    getRepoInstallation: jest.fn(),
  },
  actions: {
    listSelfHostedRunnersForRepo: jest.fn(),
    listSelfHostedRunnersForOrg: jest.fn(),
    deleteSelfHostedRunnerFromOrg: jest.fn(),
    deleteSelfHostedRunnerFromRepo: jest.fn(),
    getSelfHostedRunnerForOrg: jest.fn(),
    getSelfHostedRunnerForRepo: jest.fn(),
  },
  paginate: jest.fn(),
};
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => mockOctokit),
}));

jest.mock('./../aws/runners', () => ({
  ...jest.requireActual('./../aws/runners'),
  tag: jest.fn(),
  terminateRunner: jest.fn(),
  listEC2Runners: jest.fn(),
}));
jest.mock('./../github/auth');
jest.mock('./cache');

const mocktokit = Octokit as jest.MockedClass<typeof Octokit>;
const mockedAppAuth = mocked(ghAuth.createGithubAppAuth, { shallow: false });
const mockedInstallationAuth = mocked(ghAuth.createGithubInstallationAuth, { shallow: false });
const mockCreateClient = mocked(ghAuth.createOctokitClient, { shallow: false });
const mockListRunners = mocked(listEC2Runners);
const mockTagRunners = mocked(tag);
const mockTerminateRunners = mocked(terminateRunner);

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
    process.env.SCALE_DOWN_CONFIG = '[]';
    process.env.ENVIRONMENT = ENVIRONMENT;
    process.env.MINIMUM_RUNNING_TIME_IN_MINUTES = MINIMUM_TIME_RUNNING_IN_MINUTES.toString();
    process.env.RUNNER_BOOT_TIME_IN_MINUTES = MINIMUM_BOOT_TIME.toString();

    nock.disableNetConnect();
    jest.clearAllMocks();
    jest.resetModules();
    githubCache.clients.clear();
    githubCache.runners.clear();
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

  const endpoints = ['https://api.github.com', 'https://github.enterprise.something'];

  describe.each(endpoints)('for %s', (endpoint) => {
    beforeEach(() => {
      if (endpoint.includes('enterprise')) {
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
        expect(terminateRunner).not;
        expect(mockOctokit.apps.getRepoInstallation).not;
        expect(mockOctokit.apps.getRepoInstallation).not;
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

      it(`Should terminate orphan.`, async () => {
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
  };
}
