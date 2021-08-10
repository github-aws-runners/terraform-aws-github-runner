import moment from 'moment';
import { mocked } from 'ts-jest/utils';
import { listRunners, terminateRunner, RunnerInfo } from './runners';
import { scaleDown } from './scale-down';
import * as ghAuth from './gh-auth';
import nock from 'nock';
import { Octokit } from '@octokit/rest';

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
  },
  paginate: jest.fn(),
};
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => mockOctokit),
}));

jest.mock('./runners');
jest.mock('./gh-auth');

const mocktokit = Octokit as jest.MockedClass<typeof Octokit>;
const mockedAuth = mocked(ghAuth.createGithubAuth, true);
const mockCreateClient = mocked(ghAuth.createOctoClient, true);
const mockListRunners = mocked(listRunners);

export interface TestData {
  repositoryName: string;
  repositoryOwner: string;
}

const cleanEnv = process.env;

const environment = 'unit-test-environment';
const minimumRunningTimeInMinutes = 15;
const TEST_DATA: TestData = {
  repositoryName: 'hello-world',
  repositoryOwner: 'Codertocat',
};

let DEFAULT_RUNNERS: RunnerInfo[];
let RUNNERS_ALL_REMOVED: RunnerInfo[];
let DEFAULT_RUNNERS_REPO_TO_BE_REMOVED: RunnerInfo[];
let RUNNERS_ORG_TO_BE_REMOVED_WITH_AUTO_SCALING_CONFIG: RunnerInfo[];
let RUNNERS_REPO_WITH_AUTO_SCALING_CONFIG: RunnerInfo[];
let RUNNERS_ORG_WITH_AUTO_SCALING_CONFIG: RunnerInfo[];
let DEFAULT_RUNNERS_REPO: RunnerInfo[];
let DEFAULT_RUNNERS_ORG: RunnerInfo[];
let DEFAULT_RUNNERS_ORG_TO_BE_REMOVED: RunnerInfo[];
const DEFAULT_RUNNERS_ORIGINAL = [
  {
    instanceId: 'i-idle-101',
    launchTime: moment(new Date())
      .subtract(minimumRunningTimeInMinutes + 5, 'minutes')
      .toDate(),
    type: 'Repo',
    owner: `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
  },
  {
    instanceId: 'i-idle-102',
    launchTime: moment(new Date())
      .subtract(minimumRunningTimeInMinutes + 3, 'minutes')
      .toDate(),
    type: 'Org',
    owner: TEST_DATA.repositoryOwner,
  },
  {
    instanceId: 'i-oldest-idle-103',
    launchTime: moment(new Date())
      .subtract(minimumRunningTimeInMinutes + 27, 'minutes')
      .toDate(),
    type: 'Repo',
    owner: `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
  },
  {
    instanceId: 'i-oldest-idle-104',
    launchTime: moment(new Date())
      .subtract(minimumRunningTimeInMinutes + 27, 'minutes')
      .toDate(),
    type: 'Org',
    owner: TEST_DATA.repositoryOwner,
  },
  {
    instanceId: 'i-running-105',
    launchTime: moment(new Date()).subtract(25, 'minutes').toDate(),
    type: 'Repo',
    owner: `doe/another-repo`,
  },
  {
    instanceId: 'i-running-106',
    launchTime: moment(new Date()).subtract(25, 'minutes').toDate(),
    type: 'Org',
    owner: TEST_DATA.repositoryOwner,
  },
  {
    instanceId: 'i-orphan-107',
    launchTime: moment(new Date())
      .subtract(minimumRunningTimeInMinutes + 5, 'minutes')
      .toDate(),
    type: 'Repo',
    owner: `doe/another-repo`,
  },
  {
    instanceId: 'i-not-registered-108',
    launchTime: moment(new Date())
      .subtract(minimumRunningTimeInMinutes - 1, 'minutes')
      .toDate(),
    type: 'Repo',
    owner: `doe/another-repo`,
  },
  {
    instanceId: 'i-not-registered-109',
    launchTime: moment(new Date())
      .subtract(minimumRunningTimeInMinutes - 2, 'minutes')
      .toDate(),
    type: 'Org',
    owner: TEST_DATA.repositoryOwner,
  },
];


const DEFAULT_REGISTERED_RUNNERS = [
  {
    id: 101,
    name: 'i-idle-101',
  },
  {
    id: 102,
    name: 'i-idle-102',
  },
  {
    id: 103,
    name: 'i-oldest-idle-103',
  },
  {
    id: 104,
    name: 'i-oldest-idle-104',
  },
  {
    id: 105,
    name: 'i-running-105',
  },
  {
    id: 106,
    name: 'i-running-106',
  },
];

describe('scaleDown', () => {
  beforeEach(() => {
    process.env = { ...cleanEnv };
    process.env.GITHUB_APP_KEY_BASE64 = 'TEST_CERTIFICATE_DATA';
    process.env.GITHUB_APP_ID = '1337';
    process.env.GITHUB_APP_CLIENT_ID = 'TEST_CLIENT_ID';
    process.env.GITHUB_APP_CLIENT_SECRET = 'TEST_CLIENT_SECRET';
    process.env.RUNNERS_MAXIMUM_COUNT = '3';
    process.env.SCALE_DOWN_CONFIG = '[]';
    process.env.ENVIRONMENT = environment;
    process.env.MINIMUM_RUNNING_TIME_IN_MINUTES = minimumRunningTimeInMinutes.toString();
    nock.disableNetConnect();
    jest.clearAllMocks();
    jest.resetModules();
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

    mockOctokit.paginate.mockResolvedValue(DEFAULT_REGISTERED_RUNNERS);

    mockOctokit.actions.deleteSelfHostedRunnerFromRepo.mockImplementation((repo) => {
      if (repo.runner_id === 105) {
        throw Error();
      } else {
        return { status: 204 };
      }
    });
    mockOctokit.actions.deleteSelfHostedRunnerFromOrg.mockImplementation((repo) => {
      return repo.runner_id === 106 ? { status: 500 } : { status: 204 };
    });

    const mockTerminateRunners = mocked(terminateRunner);
    mockTerminateRunners.mockImplementation(async () => {
      return;
    });
    mockedAuth.mockResolvedValue({
      type: 'app',
      token: 'token',
      appId: 1,
      expiresAt: 'some-date',
    });
    mockCreateClient.mockResolvedValue(new mocktokit());
    DEFAULT_RUNNERS = JSON.parse(JSON.stringify(DEFAULT_RUNNERS_ORIGINAL));
    DEFAULT_RUNNERS_REPO = DEFAULT_RUNNERS.filter(r => r.type === 'Repo');
    DEFAULT_RUNNERS_ORG = DEFAULT_RUNNERS.filter(r => r.type === 'Org');
    DEFAULT_RUNNERS_REPO_TO_BE_REMOVED = DEFAULT_RUNNERS_REPO.filter(
      (r) => r.instanceId.includes('idle') || r.instanceId.includes('orphan'),
    );
    DEFAULT_RUNNERS_ORG_TO_BE_REMOVED = DEFAULT_RUNNERS_ORG.filter(
      (r) => r.instanceId.includes('idle') || r.instanceId.includes('orphan'),
    );
    
    RUNNERS_REPO_WITH_AUTO_SCALING_CONFIG = DEFAULT_RUNNERS_REPO.filter(
      (r) => r.instanceId.includes('idle') || r.instanceId.includes('running'),
    );

    RUNNERS_ORG_WITH_AUTO_SCALING_CONFIG = DEFAULT_RUNNERS_ORG.filter(
      (r) => r.instanceId.includes('idle') || r.instanceId.includes('running'),
    );

    RUNNERS_ORG_TO_BE_REMOVED_WITH_AUTO_SCALING_CONFIG = DEFAULT_RUNNERS_ORG.filter(
      (r) => r.instanceId.includes('oldest')
    );

    RUNNERS_ALL_REMOVED = DEFAULT_RUNNERS_ORG.filter(
      (r) => !r.instanceId.includes('running') && !r.instanceId.includes('registered'),
    );
  });

  describe('github.com', () => {
    describe('no runners running', () => {
      beforeEach(() => {
        mockListRunners.mockResolvedValue([]);
      });
  
      it('No runners for repo.', async () => {
        process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
        await scaleDown();
        expect(listRunners).toBeCalledWith({
          environment: environment,
        });
        expect(terminateRunner).not;
        expect(mockOctokit.apps.getRepoInstallation).not;
      });
  
      it('No runners for org.', async () => {
        process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
        await scaleDown();
        expect(listRunners).toBeCalledWith({
          environment: environment,
        });
        expect(terminateRunner).not;
        expect(mockOctokit.apps.getRepoInstallation).not;
      });
    });
  
    describe('on repo level', () => {
      beforeEach(() => {
        process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
        mockListRunners.mockResolvedValue(DEFAULT_RUNNERS_REPO);
      });
  
      it('Terminate 3 of 5 runners for repo.', async () => {
        await scaleDown();
        expect(listRunners).toBeCalledWith({
          environment: environment,
        });
  
        expect(mockOctokit.apps.getRepoInstallation).toBeCalled();
        expect(terminateRunner).toBeCalledTimes(3);
        for (const toTerminate of DEFAULT_RUNNERS_REPO_TO_BE_REMOVED) {
          expect(terminateRunner).toHaveBeenCalledWith(toTerminate);
        }
      });
    });
  
    describe('on org level', () => {
      beforeEach(() => {
        process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
        mockListRunners.mockResolvedValue(DEFAULT_RUNNERS_ORG);
      });
  
      it('Terminate 2 of 3 runners for org.', async () => {
        // This will not terminate the orphan runners that have not yet reached their minimum running time.
        await scaleDown();
        expect(listRunners).toBeCalledWith({
          environment: environment,
        });
  
        expect(mockOctokit.apps.getOrgInstallation).toBeCalled();
        expect(terminateRunner).toBeCalledTimes(2);
        for (const toTerminate of DEFAULT_RUNNERS_ORG_TO_BE_REMOVED) {
          expect(terminateRunner).toHaveBeenCalledWith(toTerminate);
        }
      });
    });
  
    describe('Have runners idle.', () => {
      beforeEach(() => {
        process.env.SCALE_DOWN_CONFIG = JSON.stringify([
          {
            idleCount: 2,
            cron: '* * * * * *',
            timeZone: 'Europe/Amsterdam',
          },
        ]);
      });
  
      it('Terminate 1 runner for org.', async () => {
        process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
        mockListRunners.mockResolvedValue(RUNNERS_ORG_WITH_AUTO_SCALING_CONFIG);
        await scaleDown();
        
        expect(listRunners).toBeCalledWith({
          environment: environment,
        });
  
        expect(mockOctokit.apps.getOrgInstallation).toBeCalled();
        expect(terminateRunner).toBeCalledTimes(1);
        for (const toTerminate of RUNNERS_ORG_TO_BE_REMOVED_WITH_AUTO_SCALING_CONFIG) {
          expect(terminateRunner).toHaveBeenCalledWith(toTerminate);
        }
      });
  
      it('Terminate 0 runners for repo.', async () => {
        mockListRunners.mockResolvedValue(RUNNERS_REPO_WITH_AUTO_SCALING_CONFIG);
        process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
        await scaleDown();
        
        expect(listRunners).toBeCalledWith({
          environment: environment,
        });
  
        expect(mockOctokit.apps.getRepoInstallation).toBeCalled();
        expect(terminateRunner).not.toBeCalled();
      });
    });

    it('Terminates 6 runners amongst all owners.', async () => {
      mockListRunners.mockResolvedValue(DEFAULT_RUNNERS);
      await scaleDown();
      
      expect(listRunners).toBeCalledWith({
        environment: environment,
      });

      expect(mockOctokit.apps.getRepoInstallation).toBeCalledTimes(2);
      expect(mockOctokit.apps.getOrgInstallation).toBeCalledTimes(1);
      expect(terminateRunner).toBeCalledTimes(6);
      for (const toTerminate of RUNNERS_ALL_REMOVED) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate);
      }
    });
  });

  describe('ghes', () => {
    beforeAll(() => {
      process.env.GHES_URL = 'https://github.enterprise.something';
    });
    describe('no runners running', () => {
      beforeEach(() => {
        mockListRunners.mockResolvedValue([]);
      });
  
      it('No runners for repo.', async () => {
        process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
        await scaleDown();
        expect(listRunners).toBeCalledWith({
          environment: environment,
        });
        expect(terminateRunner).not;
        expect(mockOctokit.apps.getRepoInstallation).not;
      });
  
      it('No runners for org.', async () => {
        process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
        await scaleDown();
        expect(listRunners).toBeCalledWith({
          environment: environment,
        });
        expect(terminateRunner).not;
        expect(mockOctokit.apps.getRepoInstallation).not;
      });
    });
  
    describe('on repo level', () => {
      beforeEach(() => {
        process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
        mockListRunners.mockResolvedValue(DEFAULT_RUNNERS_REPO);
      });
  
      it('Terminate 3 of 5 runners for repo.', async () => {
        await scaleDown();
        expect(listRunners).toBeCalledWith({
          environment: environment,
        });
  
        expect(mockOctokit.apps.getRepoInstallation).toBeCalled();
        expect(terminateRunner).toBeCalledTimes(3);
        for (const toTerminate of DEFAULT_RUNNERS_REPO_TO_BE_REMOVED) {
          expect(terminateRunner).toHaveBeenCalledWith(toTerminate);
        }
      });
    });
  
    describe('on org level', () => {
      beforeEach(() => {
        process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
        mockListRunners.mockResolvedValue(DEFAULT_RUNNERS_ORG);
      });
  
      it('Terminate 2 of 3 runners for org.', async () => {
        await scaleDown();
        expect(listRunners).toBeCalledWith({
          environment: environment,
        });
  
        expect(mockOctokit.apps.getOrgInstallation).toBeCalled();
        expect(terminateRunner).toBeCalledTimes(2);
        for (const toTerminate of DEFAULT_RUNNERS_ORG_TO_BE_REMOVED) {
          expect(terminateRunner).toHaveBeenCalledWith(toTerminate);
        }
      });
    });
  
    describe('Have runners idle.', () => {
      beforeEach(() => {
        process.env.SCALE_DOWN_CONFIG = JSON.stringify([
          {
            idleCount: 2,
            cron: '* * * * * *',
            timeZone: 'Europe/Amsterdam',
          },
        ]);
      });
  
      it('Terminate 1 of runners for org.', async () => {
        process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
        mockListRunners.mockResolvedValue(RUNNERS_ORG_WITH_AUTO_SCALING_CONFIG);
        await scaleDown();
  
        expect(listRunners).toBeCalledWith({
          environment: environment,
        });
  
        expect(mockOctokit.apps.getOrgInstallation).toBeCalled();
        expect(terminateRunner).toBeCalledTimes(1);
        for (const toTerminate of RUNNERS_ORG_TO_BE_REMOVED_WITH_AUTO_SCALING_CONFIG) {
          expect(terminateRunner).toHaveBeenCalledWith(toTerminate);
        }
      });
  
      it('Terminate 0 of runners for repo.', async () => {
        mockListRunners.mockResolvedValue(RUNNERS_REPO_WITH_AUTO_SCALING_CONFIG);
        process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
        await scaleDown();
  
        expect(listRunners).toBeCalledWith({
          environment: environment,
        });
  
        expect(mockOctokit.apps.getRepoInstallation).toBeCalled();
        expect(terminateRunner).not.toBeCalled();
      });
    });

    it('Terminates x runners for all owners.', async () => {
      mockListRunners.mockResolvedValue(DEFAULT_RUNNERS);
      await scaleDown();
      
      expect(listRunners).toBeCalledWith({
        environment: environment,
      });

      expect(mockOctokit.apps.getRepoInstallation).toBeCalled();
      expect(terminateRunner).toBeCalledTimes(6);
      for (const toTerminate of RUNNERS_ALL_REMOVED) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate);
      }
    });
  });
});
