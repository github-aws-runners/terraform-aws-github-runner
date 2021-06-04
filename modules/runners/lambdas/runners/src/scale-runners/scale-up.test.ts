import { mocked } from 'ts-jest/utils';
import { ActionRequestMessage, scaleUp } from './scale-up';
import { listRunners, createRunner } from './runners';
import * as ghAuth from './gh-auth';
import nock from 'nock';

jest.mock('@octokit/auth-app', () => ({
  createAppAuth: jest.fn().mockImplementation(() => jest.fn().mockImplementation(() => ({ token: 'Blaat' }))),
}));
const mockOctokit = {
  checks: { get: jest.fn() },
  actions: {
    createRegistrationTokenForOrg: jest.fn(),
    createRegistrationTokenForRepo: jest.fn(),
  },
  apps: {
    getOrgInstallation: jest.fn(),
    getRepoInstallation: jest.fn(),
  },
};
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => mockOctokit),
}));

jest.mock('./runners');

const TEST_DATA: ActionRequestMessage = {
  id: 1,
  eventType: 'check_run',
  repositoryName: 'hello-world',
  repositoryOwner: 'Codertocat',
  installationId: 2,
};

const TEST_DATA_WITHOUT_INSTALL_ID: ActionRequestMessage = {
  id: 3,
  eventType: 'check_run',
  repositoryName: 'hello-world',
  repositoryOwner: 'Codertocat',
  installationId: 0,
};

const cleanEnv = process.env;

beforeEach(() => {
  nock.disableNetConnect();
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...cleanEnv };
  process.env.GITHUB_APP_KEY_BASE64 = 'TEST_CERTIFICATE_DATA';
  process.env.GITHUB_APP_ID = '1337';
  process.env.GITHUB_APP_CLIENT_ID = 'TEST_CLIENT_ID';
  process.env.GITHUB_APP_CLIENT_SECRET = 'TEST_CLIENT_SECRET';
  process.env.RUNNERS_MAXIMUM_COUNT = '3';
  process.env.ENVIRONMENT = 'unit-test-environment';

  mockOctokit.checks.get.mockImplementation(() => ({
    data: {
      status: 'queued',
    },
  }));
  const mockTokenReturnValue = {
    data: {
      token: '1234abcd',
    },
  };
  const mockInstallationIdReturnValueOrgs = {
    data: {
      id: TEST_DATA.installationId,
    },
  };
  const mockInstallationIdReturnValueRepos = {
    data: {
      id: TEST_DATA.installationId,
    },
  };

  mockOctokit.actions.createRegistrationTokenForOrg.mockImplementation(() => mockTokenReturnValue);
  mockOctokit.actions.createRegistrationTokenForRepo.mockImplementation(() => mockTokenReturnValue);
  mockOctokit.apps.getOrgInstallation.mockImplementation(() => mockInstallationIdReturnValueOrgs);
  mockOctokit.apps.getRepoInstallation.mockImplementation(() => mockInstallationIdReturnValueRepos);
  const mockListRunners = mocked(listRunners);
  mockListRunners.mockImplementation(async () => [
    {
      instanceId: 'i-1234',
      launchTime: new Date(),
      repo: `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
      org: TEST_DATA.repositoryOwner,
    },
  ]);
});

describe('scaleUp with GHES', () => {
  beforeEach(() => {
    process.env.GHES_URL = 'https://github.enterprise.something';
  });

  it('ignores non-sqs events', async () => {
    expect.assertions(1);
    expect(scaleUp('aws:s3', TEST_DATA)).rejects.toEqual(Error('Cannot handle non-SQS events!'));
  });

  it('checks queued workflows', async () => {
    await scaleUp('aws:sqs', TEST_DATA);
    expect(mockOctokit.checks.get).toBeCalledWith({
      check_run_id: TEST_DATA.id,
      owner: TEST_DATA.repositoryOwner,
      repo: TEST_DATA.repositoryName,
    });
  });

  it('does not list runners when no workflows are queued', async () => {
    mockOctokit.checks.get.mockImplementation(() => ({
      data: { total_count: 0, runners: [] },
    }));
    await scaleUp('aws:sqs', TEST_DATA);
    expect(listRunners).not.toBeCalled();
  });

  describe('on org level', () => {
    beforeEach(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
    });

    it('gets the current org level runners', async () => {
      await scaleUp('aws:sqs', TEST_DATA);
      expect(listRunners).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerType: 'Org',
        runnerOwner: TEST_DATA.repositoryOwner
      });
    });

    it('does not create a token when maximum runners has been reached', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1';
      await scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).not.toBeCalled();
    });

    it('creates a token when maximum runners has not been reached', async () => {
      await scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).toBeCalled();
      expect(mockOctokit.actions.createRegistrationTokenForOrg).toBeCalledWith({
        org: TEST_DATA.repositoryOwner,
      });
    });

    it('does not retrieve installation id if already set', async () => {
      const spy = jest.spyOn(ghAuth, 'createGithubAuth');
      await scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.apps.getOrgInstallation).not.toBeCalled();
      expect(mockOctokit.apps.getRepoInstallation).not.toBeCalled();
      expect(spy).toBeCalledWith(
        TEST_DATA.installationId,
        'installation',
        "https://github.enterprise.something/api/v3"
      );
    });

    it('retrieves installation id if not set', async () => {
      const spy = jest.spyOn(ghAuth, 'createGithubAuth');
      await scaleUp('aws:sqs', TEST_DATA_WITHOUT_INSTALL_ID);
      expect(mockOctokit.apps.getRepoInstallation).not.toBeCalled();
      expect(spy).toHaveBeenNthCalledWith(1, undefined, 'app', "https://github.enterprise.something/api/v3");
      expect(spy).toHaveBeenNthCalledWith(
        2,
        TEST_DATA.installationId,
        'installation',
        "https://github.enterprise.something/api/v3"
      );
    });

    it('creates a runner with correct config', async () => {
      await scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerConfig: `--url https://github.enterprise.something/${TEST_DATA.repositoryOwner} --token 1234abcd `,
        runnerType: 'Org',
        runnerOwner: TEST_DATA.repositoryOwner,
      });
    });

    it('creates a runner with labels in s specific group', async () => {
      process.env.RUNNER_EXTRA_LABELS = 'label1,label2';
      process.env.RUNNER_GROUP_NAME = 'TEST_GROUP';
      await scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerConfig: `--url https://github.enterprise.something/${TEST_DATA.repositoryOwner} ` +
          `--token 1234abcd --labels label1,label2 --runnergroup TEST_GROUP`,
        runnerType: 'Org',
        runnerOwner: TEST_DATA.repositoryOwner,
      });
    });
  });

  describe('on repo level', () => {
    beforeEach(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
    });

    it('gets the current repo level runners', async () => {
      await scaleUp('aws:sqs', TEST_DATA);
      expect(listRunners).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerType: 'Repo',
        runnerOwner: `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
      });
    });

    it('does not create a token when maximum runners has been reached', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1';
      await scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForRepo).not.toBeCalled();
    });

    it('creates a token when maximum runners has not been reached', async () => {
      await scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForRepo).toBeCalledWith({
        owner: TEST_DATA.repositoryOwner,
        repo: TEST_DATA.repositoryName,
      });
    });

    it('does not retrieve installation id if already set', async () => {
      const spy = jest.spyOn(ghAuth, 'createGithubAuth');
      await scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.apps.getOrgInstallation).not.toBeCalled();
      expect(mockOctokit.apps.getRepoInstallation).not.toBeCalled();
      expect(spy).toBeCalledWith(
        TEST_DATA.installationId,
        'installation',
        "https://github.enterprise.something/api/v3"
      );
    });

    it('retrieves installation id if not set', async () => {
      const spy = jest.spyOn(ghAuth, 'createGithubAuth');
      await scaleUp('aws:sqs', TEST_DATA_WITHOUT_INSTALL_ID);
      expect(mockOctokit.apps.getOrgInstallation).not.toBeCalled();
      expect(spy).toHaveBeenNthCalledWith(1, undefined, 'app', "https://github.enterprise.something/api/v3");
      expect(spy).toHaveBeenNthCalledWith(
        2,
        TEST_DATA.installationId,
        'installation',
        "https://github.enterprise.something/api/v3"
      );
    });

    it('creates a runner with correct config and labels', async () => {
      process.env.RUNNER_EXTRA_LABELS = 'label1,label2';
      await scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerConfig: `--url ` +
          `https://github.enterprise.something/${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName} ` +
          `--token 1234abcd --labels label1,label2`,
        runnerType: 'Repo',
        runnerOwner: `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
      });
    });

    it('creates a runner and ensure the group argument is ignored', async () => {
      process.env.RUNNER_EXTRA_LABELS = 'label1,label2';
      process.env.RUNNER_GROUP_NAME = 'TEST_GROUP_IGNORED';
      await scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerConfig: `--url ` +
          `https://github.enterprise.something/${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName} ` +
          `--token 1234abcd --labels label1,label2`,
        runnerType: 'Repo',
        runnerOwner: `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
      });
    });
  });
});

describe('scaleUp with public GH', () => {
  it('ignores non-sqs events', async () => {
    expect.assertions(1);
    expect(scaleUp('aws:s3', TEST_DATA)).rejects.toEqual(Error('Cannot handle non-SQS events!'));
  });

  it('checks queued workflows', async () => {
    await scaleUp('aws:sqs', TEST_DATA);
    expect(mockOctokit.checks.get).toBeCalledWith({
      check_run_id: TEST_DATA.id,
      owner: TEST_DATA.repositoryOwner,
      repo: TEST_DATA.repositoryName,
    });
  });

  it('does not retrieve installation id if already set', async () => {
    const spy = jest.spyOn(ghAuth, 'createGithubAuth');
    await scaleUp('aws:sqs', TEST_DATA);
    expect(mockOctokit.apps.getOrgInstallation).not.toBeCalled();
    expect(mockOctokit.apps.getRepoInstallation).not.toBeCalled();
    expect(spy).toBeCalledWith(TEST_DATA.installationId, 'installation', "");
  });

  it('retrieves installation id if not set', async () => {
    const spy = jest.spyOn(ghAuth, 'createGithubAuth');
    await scaleUp('aws:sqs', TEST_DATA_WITHOUT_INSTALL_ID);
    expect(mockOctokit.apps.getRepoInstallation).not.toBeCalled();
    expect(spy).toHaveBeenNthCalledWith(1, undefined, 'app', "");
    expect(spy).toHaveBeenNthCalledWith(2, TEST_DATA.installationId, 'installation', "");
  });

  it('does not list runners when no workflows are queued', async () => {
    mockOctokit.checks.get.mockImplementation(() => ({
      data: { status: 'completed' },
    }));
    await scaleUp('aws:sqs', TEST_DATA);
    expect(listRunners).not.toBeCalled();
  });

  describe('on org level', () => {
    beforeEach(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
    });

    it('gets the current org level runners', async () => {
      await scaleUp('aws:sqs', TEST_DATA);
      expect(listRunners).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerType: 'Org',
        runnerOwner: TEST_DATA.repositoryOwner
      });
    });

    it('does not create a token when maximum runners has been reached', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1';
      await scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).not.toBeCalled();
    });

    it('creates a token when maximum runners has not been reached', async () => {
      await scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForOrg).toBeCalled();
      expect(mockOctokit.actions.createRegistrationTokenForOrg).toBeCalledWith({
        org: TEST_DATA.repositoryOwner,
      });
    });

    it('creates a runner with correct config', async () => {
      await scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerConfig: `--url https://github.com/${TEST_DATA.repositoryOwner} --token 1234abcd `,
        runnerType: 'Org',
        runnerOwner: TEST_DATA.repositoryOwner
      });
    });

    it('creates a runner with labels in s specific group', async () => {
      process.env.RUNNER_EXTRA_LABELS = 'label1,label2';
      process.env.RUNNER_GROUP_NAME = 'TEST_GROUP';
      await scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerConfig: `--url https://github.com/${TEST_DATA.repositoryOwner} ` +
          `--token 1234abcd --labels label1,label2 --runnergroup TEST_GROUP`,
        runnerType: 'Org',
        runnerOwner: TEST_DATA.repositoryOwner
      });
    });
  });

  describe('on repo level', () => {
    beforeEach(() => {
      process.env.ENABLE_ORGANIZATION_RUNNERS = 'false';
    });

    it('gets the current repo level runners', async () => {
      await scaleUp('aws:sqs', TEST_DATA);
      expect(listRunners).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerType: 'Repo',
        runnerOwner: `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
      });
    });

    it('does not create a token when maximum runners has been reached', async () => {
      process.env.RUNNERS_MAXIMUM_COUNT = '1';
      await scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForRepo).not.toBeCalled();
    });

    it('creates a token when maximum runners has not been reached', async () => {
      await scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.actions.createRegistrationTokenForRepo).toBeCalledWith({
        owner: TEST_DATA.repositoryOwner,
        repo: TEST_DATA.repositoryName,
      });
    });

    it('does not retrieve installation id if already set', async () => {
      const spy = jest.spyOn(ghAuth, 'createGithubAuth');
      await scaleUp('aws:sqs', TEST_DATA);
      expect(mockOctokit.apps.getOrgInstallation).not.toBeCalled();
      expect(mockOctokit.apps.getRepoInstallation).not.toBeCalled();
      expect(spy).toBeCalledWith(TEST_DATA.installationId, 'installation', "");
    });

    it('retrieves installation id if not set', async () => {
      const spy = jest.spyOn(ghAuth, 'createGithubAuth');
      await scaleUp('aws:sqs', TEST_DATA_WITHOUT_INSTALL_ID);
      expect(mockOctokit.apps.getOrgInstallation).not.toBeCalled();
      expect(spy).toHaveBeenNthCalledWith(1, undefined, 'app', "");
      expect(spy).toHaveBeenNthCalledWith(2, TEST_DATA.installationId, 'installation', "");
    });

    it('creates a runner with correct config and labels', async () => {
      process.env.RUNNER_EXTRA_LABELS = 'label1,label2';
      await scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerConfig: `--url https://github.com/${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName} ` +
          `--token 1234abcd --labels label1,label2`,
        runnerType: 'Repo',
        runnerOwner: `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
      });
    });

    it('creates a runner and ensure the group argument is ignored', async () => {
      process.env.RUNNER_EXTRA_LABELS = 'label1,label2';
      process.env.RUNNER_GROUP_NAME = 'TEST_GROUP_IGNORED';
      await scaleUp('aws:sqs', TEST_DATA);
      expect(createRunner).toBeCalledWith({
        environment: 'unit-test-environment',
        runnerConfig: `--url https://github.com/${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName} ` +
          `--token 1234abcd --labels label1,label2`,
        runnerType: 'Repo',
        runnerOwner: `${TEST_DATA.repositoryOwner}/${TEST_DATA.repositoryName}`,
      });
    });
  });
});
