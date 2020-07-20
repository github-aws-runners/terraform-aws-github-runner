import { mocked } from 'ts-jest/utils';
import { scaleDown } from './scale-down';
import moment from 'moment';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { listRunners, terminateRunner } from './runners';

jest.mock('@octokit/auth-app', () => ({
  createAppAuth: jest.fn().mockImplementation(() => jest.fn().mockImplementation(() => ({ token: 'Blaat' }))),
}));
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
};
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => mockOctokit),
}));

jest.mock('./runners');

export interface TestData {
  repositoryName: string;
  repositoryOwner: string;
}

const environment = 'unit-test-environment';
const minimumRunningTimeInMinutes = 15;
const TEST_DATA: TestData = {
  repositoryName: 'hello-world',
  repositoryOwner: 'Codertocat',
};

const DEFAULT_RUNNERS = [
  {
    instanceId: 'i-idle-101',
    launchTime: new Date('2020-05-12T11:32:06.000Z'),
    repo: `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
    org: undefined,
  },
  {
    instanceId: 'i-idle-102',
    launchTime: new Date('2020-05-12T10:32:06.000Z'),
    repo: `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
    org: undefined,
  },
  {
    instanceId: 'i-running-103',
    launchTime: moment(new Date()).subtract(25, 'minutes').toDate(),
    repo: `doe/another-repo`,
    org: undefined,
  },
  {
    instanceId: 'i-not-registered-104',
    launchTime: moment(new Date())
      .subtract(minimumRunningTimeInMinutes - 1, 'minutes')
      .toDate(),
    repo: `doe/another-repo`,
    org: undefined,
  },
  {
    instanceId: 'i-not-registered-105',
    launchTime: moment(new Date())
      .subtract(minimumRunningTimeInMinutes + 5, 'minutes')
      .toDate(),
    repo: `doe/another-repo`,
    org: undefined,
  },
];

const DEFAULT_REGISTERED_RUNNERS: any = {
  data: {
    runners: [
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
        name: 'i-running-103',
      },
    ],
  },
};

describe('scaleDown', () => {
  beforeEach(() => {
    process.env.GITHUB_APP_KEY_BASE64 = 'TEST_CERTIFICATE_DATA';
    process.env.GITHUB_APP_ID = '1337';
    process.env.GITHUB_APP_CLIENT_ID = 'TEST_CLIENT_ID';
    process.env.GITHUB_APP_CLIENT_SECRET = 'TEST_CLIENT_SECRET';
    process.env.RUNNERS_MAXIMUM_COUNT = '3';
    process.env.ENVIRONMENT = environment;
    process.env.MINIMUM_RUNNING_TIME_IN_MINUTES = minimumRunningTimeInMinutes.toString();
    jest.clearAllMocks();
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

    mockOctokit.actions.listSelfHostedRunnersForOrg.mockImplementation(() => {
      return DEFAULT_REGISTERED_RUNNERS;
    });
    mockOctokit.actions.listSelfHostedRunnersForRepo.mockImplementation(() => {
      return DEFAULT_REGISTERED_RUNNERS;
    });

    function deRegisterRunnerGithub(id: number): any {}
    mockOctokit.actions.deleteSelfHostedRunnerFromRepo.mockImplementation((repo) => {
      if (repo.runner_id === 103) {
        throw Error();
      } else {
        return { status: 204 };
      }
    });
    mockOctokit.actions.deleteSelfHostedRunnerFromOrg.mockImplementation((repo) => {
      return repo.runner_id === 103 ? { status: 500 } : { status: 204 };
    });

    const mockTerminateRunners = mocked(terminateRunner);
    mockTerminateRunners.mockImplementation(async () => {
      return;
    });
  });

  describe('no runners running', () => {
    beforeAll(() => {
      const mockListRunners = mocked(listRunners);
      mockListRunners.mockImplementation(async () => []);
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
    beforeAll(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
      const mockListRunners = mocked(listRunners);
      mockListRunners.mockImplementation(async () => {
        return DEFAULT_RUNNERS;
      });
    });

    it('Terminate 3 of 5 runners for repo.', async () => {
      await scaleDown();
      expect(listRunners).toBeCalledWith({
        environment: environment,
      });

      expect(mockOctokit.apps.getRepoInstallation).toBeCalled();
      expect(terminateRunner).toBeCalledTimes(3);
      for (const toTerminate of [DEFAULT_RUNNERS[0], DEFAULT_RUNNERS[1], DEFAULT_RUNNERS[4]]) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate);
      }
    });
  });

  describe('on org level', () => {
    beforeAll(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
      const mockListRunners = mocked(listRunners);
      mockListRunners.mockImplementation(async () => {
        return DEFAULT_RUNNERS;
      });
    });

    it('Terminate 3 of 5 runners for org.', async () => {
      await scaleDown();
      expect(listRunners).toBeCalledWith({
        environment: environment,
      });

      expect(mockOctokit.apps.getOrgInstallation).toBeCalled();
      expect(terminateRunner).toBeCalledTimes(3);
      for (const toTerminate of [DEFAULT_RUNNERS[0], DEFAULT_RUNNERS[1], DEFAULT_RUNNERS[4]]) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate);
      }
    });
  });
});
