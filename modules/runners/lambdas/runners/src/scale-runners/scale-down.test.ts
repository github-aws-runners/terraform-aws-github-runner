import moment from 'moment';
import { mocked } from 'ts-jest/utils';
import { listRunners, terminateRunner } from './runners';
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
    launchTime: moment(new Date())
      .subtract(minimumRunningTimeInMinutes + 5, 'minutes')
      .toDate(),
    repo: `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
    org: undefined,
  },
  {
    instanceId: 'i-oldest-idle-102',
    launchTime: moment(new Date())
      .subtract(minimumRunningTimeInMinutes + 27, 'minutes')
      .toDate(),
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
    instanceId: 'i-orphan-104',
    launchTime: moment(new Date())
      .subtract(minimumRunningTimeInMinutes + 5, 'minutes')
      .toDate(),
    repo: `doe/another-repo`,
    org: undefined,
  },
  {
    instanceId: 'i-not-registered-105',
    launchTime: moment(new Date())
      .subtract(minimumRunningTimeInMinutes - 1, 'minutes')
      .toDate(),
    repo: `doe/another-repo`,
    org: undefined,
  },
];

const DEFAULT_RUNNERS_TO_BE_REMOVED = DEFAULT_RUNNERS.filter(
  (r) => r.instanceId.includes('idle') || r.instanceId.includes('orphan'),
);

const RUNNERS_WITH_AUTO_SCALING_CONFIG = DEFAULT_RUNNERS.filter(
  (r) => r.instanceId.includes('idle') || r.instanceId.includes('running'),
);

const RUNNERS_TO_BE_REMOVED_WITH_AUTO_SCALING_CONFIG = DEFAULT_RUNNERS.filter((r) => r.instanceId.includes('oldest'));

const DEFAULT_REGISTERED_RUNNERS = [
  {
    id: 101,
    name: 'i-idle-101',
  },
  {
    id: 102,
    name: 'i-oldest-idle-102',
  },
  {
    id: 103,
    name: 'i-running-103',
  },
];

describe('scaleDown', () => {
  beforeEach(() => {
    process.env.GITHUB_APP_KEY_BASE64 = 'TEST_CERTIFICATE_DATA';
    process.env.GITHUB_APP_ID = '1337';
    process.env.GITHUB_APP_CLIENT_ID = 'TEST_CLIENT_ID';
    process.env.GITHUB_APP_CLIENT_SECRET = 'TEST_CLIENT_SECRET';
    process.env.RUNNERS_MAXIMUM_COUNT = '3';
    process.env.ENVIRONMENT = environment;
    process.env.MINIMUM_RUNNING_TIME_IN_MINUTES = minimumRunningTimeInMinutes.toString();
    nock.disableNetConnect();
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

    mockOctokit.paginate.mockImplementationOnce(() => {
      return DEFAULT_REGISTERED_RUNNERS;
    });

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
      mockedAuth.mockResolvedValue({
        type: 'app',
        token: 'token',
        appId: 1,
        expiresAt: 'some-date',
      });
      mockCreateClient.mockResolvedValue(new mocktokit());
      const mockListRunners = mocked(listRunners);
      mockListRunners.mockImplementation(async () => []);
    });

    it('No runners for repo.', async () => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
      process.env.SCALE_DOWN_CONFIG = '[]';
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
      process.env.SCALE_DOWN_CONFIG = '[]';
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
      for (const toTerminate of DEFAULT_RUNNERS_TO_BE_REMOVED) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate);
      }
    });
  });

  describe('on org level', () => {
    beforeAll(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
      process.env.SCALE_DOWN_CONFIG = '[]';
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
      for (const toTerminate of DEFAULT_RUNNERS_TO_BE_REMOVED) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate);
      }
    });
  });

  describe('on repo level', () => {
    beforeAll(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
      process.env.SCALE_DOWN_CONFIG = '[]';
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
      for (const toTerminate of DEFAULT_RUNNERS_TO_BE_REMOVED) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate);
      }
    });
  });

  describe('on org level', () => {
    beforeAll(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
      process.env.SCALE_DOWN_CONFIG = '[]';
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
      for (const toTerminate of DEFAULT_RUNNERS_TO_BE_REMOVED) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate);
      }
    });
  });

  describe('Have runners idle.', () => {
    beforeAll(() => {
      process.env.SCALE_DOWN_CONFIG = JSON.stringify([
        {
          idleCount: 2,
          cron: '* * * * * *',
          timeZone: 'Europe/Amsterdam',
        },
      ]);

      const mockListRunners = mocked(listRunners);
      mockListRunners.mockImplementation(async () => {
        return RUNNERS_WITH_AUTO_SCALING_CONFIG;
      });
    });

    it('Terminate 1 of runners for org.', async () => {
      await scaleDown();
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';

      expect(listRunners).toBeCalledWith({
        environment: environment,
      });

      expect(mockOctokit.apps.getOrgInstallation).toBeCalled();
      expect(terminateRunner).toBeCalledTimes(1);
      for (const toTerminate of RUNNERS_TO_BE_REMOVED_WITH_AUTO_SCALING_CONFIG) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate);
      }
    });

    it('Terminate 1 of runners for repo.', async () => {
      await scaleDown();
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';

      expect(listRunners).toBeCalledWith({
        environment: environment,
      });

      expect(mockOctokit.apps.getOrgInstallation).toBeCalled();
      expect(terminateRunner).toBeCalledTimes(1);
      for (const toTerminate of RUNNERS_TO_BE_REMOVED_WITH_AUTO_SCALING_CONFIG) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate);
      }
    });
  });
});

describe('scaleDown ghes', () => {
  beforeEach(() => {
    process.env.GITHUB_APP_KEY_BASE64 = 'TEST_CERTIFICATE_DATA';
    process.env.GITHUB_APP_ID = '1337';
    process.env.GITHUB_APP_CLIENT_ID = 'TEST_CLIENT_ID';
    process.env.GITHUB_APP_CLIENT_SECRET = 'TEST_CLIENT_SECRET';
    process.env.RUNNERS_MAXIMUM_COUNT = '3';
    process.env.ENVIRONMENT = environment;
    process.env.MINIMUM_RUNNING_TIME_IN_MINUTES = minimumRunningTimeInMinutes.toString();
    process.env.GHES_URL = 'https://github.enterprise.something';
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

    mockOctokit.paginate.mockImplementationOnce(() => {
      return DEFAULT_REGISTERED_RUNNERS;
    });

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
      process.env.SCALE_DOWN_CONFIG = '[]';
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
      process.env.SCALE_DOWN_CONFIG = '[]';
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
      for (const toTerminate of DEFAULT_RUNNERS_TO_BE_REMOVED) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate);
      }
    });
  });

  describe('on org level', () => {
    beforeAll(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
      process.env.SCALE_DOWN_CONFIG = '[]';
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
      for (const toTerminate of DEFAULT_RUNNERS_TO_BE_REMOVED) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate);
      }
    });
  });

  describe('on repo level', () => {
    beforeAll(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
      process.env.SCALE_DOWN_CONFIG = '[]';
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
      for (const toTerminate of DEFAULT_RUNNERS_TO_BE_REMOVED) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate);
      }
    });
  });

  describe('on org level', () => {
    beforeAll(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
      process.env.SCALE_DOWN_CONFIG = '[]';
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
      for (const toTerminate of DEFAULT_RUNNERS_TO_BE_REMOVED) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate);
      }
    });
  });

  describe('Have runners idle.', () => {
    beforeAll(() => {
      process.env.SCALE_DOWN_CONFIG = JSON.stringify([
        {
          idleCount: 2,
          cron: '* * * * * *',
          timeZone: 'Europe/Amsterdam',
        },
      ]);

      const mockListRunners = mocked(listRunners);
      mockListRunners.mockImplementation(async () => {
        return RUNNERS_WITH_AUTO_SCALING_CONFIG;
      });
    });

    it('Terminate 1 of runners for org.', async () => {
      await scaleDown();
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';

      expect(listRunners).toBeCalledWith({
        environment: environment,
      });

      expect(mockOctokit.apps.getOrgInstallation).toBeCalled();
      expect(terminateRunner).toBeCalledTimes(1);
      for (const toTerminate of RUNNERS_TO_BE_REMOVED_WITH_AUTO_SCALING_CONFIG) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate);
      }
    });

    it('Terminate 1 of runners for repo.', async () => {
      await scaleDown();
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';

      expect(listRunners).toBeCalledWith({
        environment: environment,
      });

      expect(mockOctokit.apps.getOrgInstallation).toBeCalled();
      expect(terminateRunner).toBeCalledTimes(1);
      for (const toTerminate of RUNNERS_TO_BE_REMOVED_WITH_AUTO_SCALING_CONFIG) {
        expect(terminateRunner).toHaveBeenCalledWith(toTerminate);
      }
    });
  });
});
