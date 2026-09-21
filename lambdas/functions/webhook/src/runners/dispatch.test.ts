import { getParameter } from '@aws-github-runner/aws-ssm-util';
import { selectDynamicLabelQueue } from '@aws-github-runner/compute-providers/webhook';

import nock from 'nock';
import { WorkflowJobEvent } from '@octokit/webhooks-types';

import workFlowJobEvent from '../../test/resources/github_workflowjob_event.json';
import runnerConfig from '../../test/resources/multi_runner_configurations.json';

import { RunnerConfig, sendActionRequest } from '../sqs';
import { dispatch } from './dispatch';
import { ConfigDispatcher } from '../ConfigLoader';
import { logger } from '@aws-github-runner/aws-powertools-util';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../sqs');
vi.mock('@aws-github-runner/aws-ssm-util');
vi.mock('@aws-github-runner/compute-providers/webhook', () => ({
  selectDynamicLabelQueue: vi.fn(),
}));

const GITHUB_APP_WEBHOOK_SECRET = 'TEST_SECRET';

const cleanEnv = process.env;

describe('Dispatcher', () => {
  let originalError: Console['error'];
  let config: ConfigDispatcher;

  beforeEach(async () => {
    logger.setLogLevel('DEBUG');
    process.env = { ...cleanEnv };

    nock.disableNetConnect();
    originalError = console.error;
    console.error = vi.fn();
    vi.clearAllMocks();
    vi.resetAllMocks();

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
    });

    it('should handle workflow_job events with a valid installation id', async () => {
      config = await createConfig(['github-aws-runners/terraform-aws-github-runner']);
      const event = { ...workFlowJobEvent, installation: { id: 123 } } as unknown as WorkflowJobEvent;
      const resp = await dispatch(event, 'workflow_job', config);
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).toHaveBeenCalled();
    });

    it('should handle workflow_job events from allow listed repositories', async () => {
      config = await createConfig(['github-aws-runners/terraform-aws-github-runner']);
      const event = workFlowJobEvent as unknown as WorkflowJobEvent;
      const resp = await dispatch(event, 'workflow_job', config);
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).toHaveBeenCalled();
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
        repoOwnerType: 'Organization',
        labels: ['self-hosted', 'Test'],
      });
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
        repoOwnerType: 'Organization',
        labels: ['self-hosted', 'match'],
      });
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
    });
  });

  describe('queue selection strategy', () => {
    const twoExactMatches: RunnerConfig = [
      { ...runnerConfig[0], id: 'q1', matcherConfig: { labelMatchers: [['self-hosted', 'any']], exactMatch: true } },
      { ...runnerConfig[0], id: 'q2', matcherConfig: { labelMatchers: [['self-hosted', 'any']], exactMatch: true } },
    ];
    const jobEvent = (labels: string[]) =>
      ({
        ...workFlowJobEvent,
        workflow_job: { ...workFlowJobEvent.workflow_job, labels },
      }) as unknown as WorkflowJobEvent;

    it('defaults to the first matching queue', async () => {
      config = await createConfig(undefined, twoExactMatches);
      await dispatch(jobEvent(['self-hosted', 'any']), 'workflow_job', config);
      expect(sendActionRequest).toHaveBeenCalledWith(expect.objectContaining({ queueId: 'q1' }));
    });

    it('random spreads across equally-matching queues', async () => {
      process.env.QUEUE_SELECTION_STRATEGY = 'random';
      config = await createConfig(undefined, twoExactMatches);
      const rand = vi.spyOn(Math, 'random').mockReturnValue(0.99);
      await dispatch(jobEvent(['self-hosted', 'any']), 'workflow_job', config);
      expect(sendActionRequest).toHaveBeenCalledWith(expect.objectContaining({ queueId: 'q2' }));
      rand.mockRestore();
    });

    it('random still respects exactMatch priority (never a lower-priority match)', async () => {
      process.env.QUEUE_SELECTION_STRATEGY = 'random';
      config = await createConfig(undefined, [
        { ...runnerConfig[0], id: 'loose', matcherConfig: { labelMatchers: [['self-hosted']], exactMatch: false } },
        {
          ...runnerConfig[0],
          id: 'exact',
          matcherConfig: { labelMatchers: [['self-hosted', 'any']], exactMatch: true },
        },
      ]);
      const rand = vi.spyOn(Math, 'random').mockReturnValue(0.99);
      await dispatch(jobEvent(['self-hosted', 'any']), 'workflow_job', config);
      expect(sendActionRequest).toHaveBeenCalledWith(expect.objectContaining({ queueId: 'exact' }));
      rand.mockRestore();
    });

    it('all dispatches to every equally-matching queue but not lower-priority ones', async () => {
      process.env.QUEUE_SELECTION_STRATEGY = 'all';
      config = await createConfig(undefined, [
        { ...runnerConfig[0], id: 'loose', matcherConfig: { labelMatchers: [['self-hosted']], exactMatch: false } },
        { ...runnerConfig[0], id: 'q1', matcherConfig: { labelMatchers: [['self-hosted', 'any']], exactMatch: true } },
        { ...runnerConfig[0], id: 'q2', matcherConfig: { labelMatchers: [['self-hosted', 'any']], exactMatch: true } },
      ]);
      await dispatch(jobEvent(['self-hosted', 'any']), 'workflow_job', config);
      expect(sendActionRequest).toHaveBeenCalledTimes(2);
      expect(sendActionRequest).toHaveBeenCalledWith(expect.objectContaining({ queueId: 'q1' }));
      expect(sendActionRequest).toHaveBeenCalledWith(expect.objectContaining({ queueId: 'q2' }));
      expect(sendActionRequest).not.toHaveBeenCalledWith(expect.objectContaining({ queueId: 'loose' }));
    });

    it('rejects an invalid strategy at config load', async () => {
      process.env.QUEUE_SELECTION_STRATEGY = 'bogus';
      ConfigDispatcher.reset();
      mockSSMResponse(twoExactMatches);
      await expect(ConfigDispatcher.load()).rejects.toThrow(/queue selection strategy/i);
    });
  });

  describe('per-matcher dynamic labels handling', () => {
    const baseRunner = runnerConfig[0];

    beforeEach(() => {
      vi.mocked(selectDynamicLabelQueue).mockImplementation((matches, nonGhrLabels, sanitizedGhrLabels) => ({
        queue: matches[0],
        labels: [...nonGhrLabels, ...sanitizedGhrLabels],
      }));
    });

    it('strips invalid ghr- labels before provider selection and dispatch', async () => {
      const longLabel = 'ghr-' + 'a'.repeat(125); // 129 chars
      config = await createConfig(undefined, [
        {
          ...baseRunner,
          matcherConfig: {
            labelMatchers: [['self-hosted', 'linux']],
            exactMatch: true,
            enableDynamicLabels: true,
          },
        },
      ]);
      const event = {
        ...workFlowJobEvent,
        workflow_job: {
          ...workFlowJobEvent.workflow_job,
          labels: [
            'self-hosted',
            'linux',
            'ghr-valid:value',
            'ghr-list:value;another',
            'ghr-bad,separator',
            'ghr-bad|separator',
            'ghr-bad label',
            longLabel,
          ],
        },
      } as unknown as WorkflowJobEvent;
      const resp = await dispatch(event, 'workflow_job', config);
      expect(resp.statusCode).toBe(201);
      expect(selectDynamicLabelQueue).toHaveBeenCalledWith(
        [expect.objectContaining({ id: baseRunner.id })],
        ['self-hosted', 'linux'],
        ['ghr-valid:value', 'ghr-list:value;another'],
      );
      expect(sendActionRequest).toHaveBeenCalledWith(
        expect.objectContaining({ labels: ['self-hosted', 'linux', 'ghr-valid:value', 'ghr-list:value;another'] }),
      );
    });

    it('rejects the job when no provider accepts the dynamic labels', async () => {
      vi.mocked(selectDynamicLabelQueue).mockReturnValue(undefined);
      config = await createConfig(undefined, [
        {
          ...baseRunner,
          matcherConfig: {
            labelMatchers: [['self-hosted', 'linux']],
            exactMatch: true,
            enableDynamicLabels: true,
          },
        },
      ]);
      const event = {
        ...workFlowJobEvent,
        workflow_job: {
          ...workFlowJobEvent.workflow_job,
          labels: ['self-hosted', 'linux', 'ghr-provider-setting:value'],
        },
      } as unknown as WorkflowJobEvent;
      const resp = await dispatch(event, 'workflow_job', config);
      expect(resp.statusCode).toBe(202);
      expect(sendActionRequest).not.toHaveBeenCalled();
    });

    it('dispatches to the queue and labels returned by the provider selector', async () => {
      config = await createConfig(undefined, [
        {
          ...baseRunner,
          id: 'first',
          matcherConfig: {
            labelMatchers: [['self-hosted', 'linux']],
            exactMatch: true,
            enableDynamicLabels: true,
          },
        },
        {
          ...baseRunner,
          id: 'selected',
          matcherConfig: {
            labelMatchers: [['self-hosted', 'linux']],
            exactMatch: true,
            enableDynamicLabels: true,
          },
        },
      ]);

      vi.mocked(selectDynamicLabelQueue).mockImplementation((matches) => ({
        queue: matches[1],
        labels: ['self-hosted', 'linux', 'ghr-provider-setting:normalized'],
      }));

      const event = {
        ...workFlowJobEvent,
        workflow_job: {
          ...workFlowJobEvent.workflow_job,
          labels: ['self-hosted', 'linux', 'ghr-provider-setting:requested'],
        },
      } as unknown as WorkflowJobEvent;
      const resp = await dispatch(event, 'workflow_job', config);
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          queueId: 'selected',
          labels: ['self-hosted', 'linux', 'ghr-provider-setting:normalized'],
        }),
      );
    });

    it('forwards non-dynamic jobs as-is to the first match', async () => {
      config = await createConfig(undefined, [
        {
          ...baseRunner,
          id: 'first',
          matcherConfig: {
            labelMatchers: [['self-hosted', 'linux']],
            exactMatch: true,
            enableDynamicLabels: true,
          },
        },
      ]);
      const event = {
        ...workFlowJobEvent,
        workflow_job: {
          ...workFlowJobEvent.workflow_job,
          labels: ['self-hosted', 'linux'],
        },
      } as unknown as WorkflowJobEvent;
      const resp = await dispatch(event, 'workflow_job', config);
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).toHaveBeenCalledWith(
        expect.objectContaining({ queueId: 'first', labels: ['self-hosted', 'linux'] }),
      );
      expect(selectDynamicLabelQueue).not.toHaveBeenCalled();
    });
  });
});

function mockSSMResponse(runnerConfigInput?: RunnerConfig) {
  process.env.PARAMETER_RUNNER_MATCHER_CONFIG_PATH = '/github-runner/runner-matcher-config';
  const mockedGet = vi.mocked(getParameter);
  mockedGet.mockImplementation((parameter_name) => {
    const value =
      parameter_name == '/github-runner/runner-matcher-config'
        ? JSON.stringify(runnerConfigInput ?? runnerConfig)
        : GITHUB_APP_WEBHOOK_SECRET;
    return Promise.resolve(value);
  });
}

async function createConfig(repositoryAllowList?: string[], runnerConfig?: RunnerConfig): Promise<ConfigDispatcher> {
  if (repositoryAllowList) {
    process.env.REPOSITORY_ALLOW_LIST = JSON.stringify(repositoryAllowList);
  }
  ConfigDispatcher.reset();
  mockSSMResponse(runnerConfig);
  return await ConfigDispatcher.load();
}
