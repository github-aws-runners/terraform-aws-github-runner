import { getParameter } from '@aws-github-runner/aws-ssm-util';
import { mocked } from 'jest-mock';
import nock from 'nock';
import { WorkflowJobEvent } from '@octokit/webhooks-types';

import workFlowJobEvent from '../../test/resources/github_workflowjob_event.json';
import runnerConfig from '../../test/resources/multi_runner_configurations.json';

import { RunnerConfig, sendActionRequest } from '../sqs';
import { canRunJob, dispatch } from './dispatch';
import { Config } from '../ConfigResolver';

jest.mock('../sqs');
jest.mock('@aws-github-runner/aws-ssm-util');

const sendWebhookEventToWorkflowJobQueueMock = jest.mocked(sendActionRequest);
const GITHUB_APP_WEBHOOK_SECRET = 'TEST_SECRET';

const cleanEnv = process.env;

describe('Dispatcher', () => {
  let originalError: Console['error'];
  let config: Config;

  beforeEach(async () => {
    process.env = { ...cleanEnv };

    nock.disableNetConnect();
    originalError = console.error;
    console.error = jest.fn();
    jest.clearAllMocks();
    jest.resetAllMocks();

    mockSSMResponse();
    config = await createConfig(undefined, runnerConfig);
  });

  afterEach(() => {
    console.error = originalError;
  });

  describe('handle work flow job events ', () => {
    it('should not handle "workflow_job" events with actions other than queued (action = started)', async () => {
      const event = { ...workFlowJobEvent, action: 'started' } as unknown as WorkflowJobEvent;
      const resp = await dispatch(event, 'workflow_job', config);
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).not.toHaveBeenCalled();
    });

    it('should not handle workflow_job events from unlisted repositories', async () => {
      const event = workFlowJobEvent as unknown as WorkflowJobEvent;
      config = await createConfig(['NotCodertocat/Hello-World']);
      await expect(dispatch(event, 'push', config)).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(sendActionRequest).not.toHaveBeenCalled();
      expect(sendWebhookEventToWorkflowJobQueueMock).not.toHaveBeenCalled();
    });

    it('should handle workflow_job events without installation id', async () => {
      config = await createConfig(['philips-labs/terraform-aws-github-runner']);
      const event = { ...workFlowJobEvent, installation: null } as unknown as WorkflowJobEvent;
      const resp = await dispatch(event, 'workflow_job', config);
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).toHaveBeenCalled();
      expect(sendWebhookEventToWorkflowJobQueueMock).toHaveBeenCalled();
    });

    it('should handle workflow_job events from allow listed repositories', async () => {
      config = await createConfig(['philips-labs/terraform-aws-github-runner']);
      const event = workFlowJobEvent as unknown as WorkflowJobEvent;
      const resp = await dispatch(event, 'workflow_job', config);
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).toHaveBeenCalled();
      expect(sendWebhookEventToWorkflowJobQueueMock).toHaveBeenCalled();
    });

    it('should match labels', async () => {
      config = await createConfig(undefined, [
        {
          ...runnerConfig[0],
          matcherConfig: {
            labelMatchers: [['self-hosted', 'test']],
            exactMatch: true,
          },
        },
        runnerConfig[1],
      ]);

      const event = {
        ...workFlowJobEvent,
        workflow_job: {
          ...workFlowJobEvent.workflow_job,
          labels: ['self-hosted', 'Test'],
        },
      } as unknown as WorkflowJobEvent;
      const resp = await dispatch(event, 'workflow_job', config);
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).toHaveBeenCalledWith({
        id: event.workflow_job.id,
        repositoryName: event.repository.name,
        repositoryOwner: event.repository.owner.login,
        eventType: 'workflow_job',
        installationId: 0,
        queueId: runnerConfig[0].id,
        queueFifo: false,
        repoOwnerType: 'Organization',
      });
      expect(sendWebhookEventToWorkflowJobQueueMock).toHaveBeenCalled();
    });

    it('should sort matcher with exact first.', async () => {
      config = await createConfig(undefined, [
        {
          ...runnerConfig[0],
          matcherConfig: {
            labelMatchers: [['self-hosted', 'match', 'not-select']],
            exactMatch: false,
          },
        },
        {
          ...runnerConfig[0],
          matcherConfig: {
            labelMatchers: [['self-hosted', 'no-match']],
            exactMatch: true,
          },
        },
        {
          ...runnerConfig[0],
          id: 'match',
          matcherConfig: {
            labelMatchers: [['self-hosted', 'match']],
            exactMatch: true,
          },
        },
        runnerConfig[1],
      ]);

      const event = {
        ...workFlowJobEvent,
        workflow_job: {
          ...workFlowJobEvent.workflow_job,
          labels: ['self-hosted', 'match'],
        },
      } as unknown as WorkflowJobEvent;
      const resp = await dispatch(event, 'workflow_job', config);
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).toHaveBeenCalledWith({
        id: event.workflow_job.id,
        repositoryName: event.repository.name,
        repositoryOwner: event.repository.owner.login,
        eventType: 'workflow_job',
        installationId: 0,
        queueId: 'match',
        queueFifo: false,
        repoOwnerType: 'Organization',
      });
      expect(sendWebhookEventToWorkflowJobQueueMock).toHaveBeenCalled();
    });

    it('should not accept jobs where not all labels are supported (single matcher).', async () => {
      config = await createConfig(undefined, [
        {
          ...runnerConfig[0],
          matcherConfig: {
            labelMatchers: [['self-hosted', 'x64', 'linux']],
            exactMatch: true,
          },
        },
      ]);

      const event = {
        ...workFlowJobEvent,
        workflow_job: {
          ...workFlowJobEvent.workflow_job,
          labels: ['self-hosted', 'linux', 'x64', 'on-demand'],
        },
      } as unknown as WorkflowJobEvent;
      const resp = await dispatch(event, 'workflow_job', config);
      expect(resp.statusCode).toBe(202);
      expect(sendActionRequest).not.toHaveBeenCalled();
      expect(sendWebhookEventToWorkflowJobQueueMock).not.toHaveBeenCalled();
    });
  });

  describe('decides can run job based on label and config (canRunJob)', () => {
    it('should accept job with an exact match and identical labels.', () => {
      const workflowLabels = ['self-hosted', 'linux', 'x64', 'ubuntu-latest'];
      const runnerLabels = [['self-hosted', 'linux', 'x64', 'ubuntu-latest']];
      expect(canRunJob(workflowLabels, runnerLabels, true)).toBe(true);
    });

    it('should accept job with an exact match and identical labels, ignoring cases.', () => {
      const workflowLabels = ['self-Hosted', 'Linux', 'X64', 'ubuntu-Latest'];
      const runnerLabels = [['self-hosted', 'linux', 'x64', 'ubuntu-latest']];
      expect(canRunJob(workflowLabels, runnerLabels, true)).toBe(true);
    });

    it('should accept job with an exact match and runner supports requested capabilities.', () => {
      const workflowLabels = ['self-hosted', 'linux', 'x64'];
      const runnerLabels = [['self-hosted', 'linux', 'x64', 'ubuntu-latest']];
      expect(canRunJob(workflowLabels, runnerLabels, true)).toBe(true);
    });

    it('should NOT accept job with an exact match and runner not matching requested capabilities.', () => {
      const workflowLabels = ['self-hosted', 'linux', 'x64', 'ubuntu-latest'];
      const runnerLabels = [['self-hosted', 'linux', 'x64']];
      expect(canRunJob(workflowLabels, runnerLabels, true)).toBe(false);
    });

    it('should accept job with for a non exact match. Any label that matches will accept the job.', () => {
      const workflowLabels = ['self-hosted', 'linux', 'x64', 'ubuntu-latest', 'gpu'];
      const runnerLabels = [['gpu']];
      expect(canRunJob(workflowLabels, runnerLabels, false)).toBe(true);
    });

    it('should NOT accept job with for an exact match. Not all requested capabilites are supported.', () => {
      const workflowLabels = ['self-hosted', 'linux', 'x64', 'ubuntu-latest', 'gpu'];
      const runnerLabels = [['gpu']];
      expect(canRunJob(workflowLabels, runnerLabels, true)).toBe(false);
    });

    it('should not accept jobs not providing labels if exact match is.', () => {
      const workflowLabels: string[] = [];
      const runnerLabels = [['self-hosted', 'linux', 'x64']];
      expect(canRunJob(workflowLabels, runnerLabels, true)).toBe(false);
    });

    it('should accept jobs not providing labels and exact match is set to false.', () => {
      const workflowLabels: string[] = [];
      const runnerLabels = [['self-hosted', 'linux', 'x64']];
      expect(canRunJob(workflowLabels, runnerLabels, false)).toBe(true);
    });
  });
});

function mockSSMResponse(runnerConfigInput?: RunnerConfig) {
  const mockedGet = mocked(getParameter);
  mockedGet.mockImplementation((parameter_name) => {
    const value =
      parameter_name == '/github-runner/runner-matcher-config'
        ? JSON.stringify(runnerConfigInput ?? runnerConfig)
        : GITHUB_APP_WEBHOOK_SECRET;
    return Promise.resolve(value);
  });
}

async function createConfig(repositoryAllowList?: string[], runnerConfig?: RunnerConfig): Promise<Config> {
  if (repositoryAllowList) {
    process.env.REPOSITORY_ALLOW_LIST = JSON.stringify(repositoryAllowList);
  }
  Config.reset();
  mockSSMResponse(runnerConfig);
  return await Config.load();
}
