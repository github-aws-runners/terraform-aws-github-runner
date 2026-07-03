import { getParameter } from '@aws-github-runner/aws-ssm-util';

import nock from 'nock';
import { WorkflowJobEvent } from '@octokit/webhooks-types';

import workFlowJobEvent from '../../test/resources/github_workflowjob_event.json';
import runnerConfig from '../../test/resources/multi_runner_configurations.json';

import { RunnerConfig, sendActionRequest } from '../sqs';
import { canRunJob, dispatch } from './dispatch';
import { ConfigDispatcher } from '../ConfigLoader';
import { logger } from '@aws-github-runner/aws-powertools-util';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../sqs');
vi.mock('@aws-github-runner/aws-ssm-util');

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

    it('should NOT accept job with for an exact match. Not all requested capabilities are supported.', () => {
      const workflowLabels = ['self-hosted', 'linux', 'x64', 'ubuntu-latest', 'gpu'];
      const runnerLabels = [['gpu']];
      expect(canRunJob(workflowLabels, runnerLabels, true)).toBe(false);
    });

    it('should match when runner has more labels than workflow requests with exactMatch=true (unidirectional).', () => {
      const workflowLabels = ['self-hosted', 'linux', 'x64', 'staging', 'ubuntu-2404'];
      const runnerLabels = [['self-hosted', 'linux', 'x64', 'staging', 'ubuntu-2404', 'on-demand']];
      expect(canRunJob(workflowLabels, runnerLabels, true)).toBe(true);
    });

    it('should match when labels are exactly identical with exactMatch=true.', () => {
      const workflowLabels = ['self-hosted', 'linux', 'on-demand'];
      const runnerLabels = [['self-hosted', 'linux', 'on-demand']];
      expect(canRunJob(workflowLabels, runnerLabels, true)).toBe(true);
    });

    it('should match with exactMatch=true when labels are in different order.', () => {
      const workflowLabels = ['linux', 'self-hosted', 'x64'];
      const runnerLabels = [['self-hosted', 'linux', 'x64']];
      expect(canRunJob(workflowLabels, runnerLabels, true)).toBe(true);
    });

    it('should match with exactMatch=true when labels are completely shuffled.', () => {
      const workflowLabels = ['x64', 'ubuntu-latest', 'self-hosted', 'linux'];
      const runnerLabels = [['self-hosted', 'linux', 'x64', 'ubuntu-latest']];
      expect(canRunJob(workflowLabels, runnerLabels, true)).toBe(true);
    });

    it('should match with exactMatch=false when labels are in different order.', () => {
      const workflowLabels = ['gpu', 'self-hosted'];
      const runnerLabels = [['self-hosted', 'gpu']];
      expect(canRunJob(workflowLabels, runnerLabels, false)).toBe(true);
    });

    // bidirectionalLabelMatch tests
    it('should NOT match when runner has more labels than workflow requests (bidirectionalLabelMatch=true).', () => {
      const workflowLabels = ['self-hosted', 'linux', 'x64', 'staging', 'ubuntu-2404'];
      const runnerLabels = [['self-hosted', 'linux', 'x64', 'staging', 'ubuntu-2404', 'on-demand']];
      expect(canRunJob(workflowLabels, runnerLabels, false, true)).toBe(false);
    });

    it('should NOT match when workflow has more labels than runner (bidirectionalLabelMatch=true).', () => {
      const workflowLabels = ['self-hosted', 'linux', 'x64', 'ubuntu-latest', 'gpu'];
      const runnerLabels = [['self-hosted', 'linux', 'x64']];
      expect(canRunJob(workflowLabels, runnerLabels, false, true)).toBe(false);
    });

    it('should match when labels are exactly identical with bidirectionalLabelMatch=true.', () => {
      const workflowLabels = ['self-hosted', 'linux', 'on-demand'];
      const runnerLabels = [['self-hosted', 'linux', 'on-demand']];
      expect(canRunJob(workflowLabels, runnerLabels, false, true)).toBe(true);
    });

    it('should match with bidirectionalLabelMatch=true when labels are in different order.', () => {
      const workflowLabels = ['linux', 'self-hosted', 'x64'];
      const runnerLabels = [['self-hosted', 'linux', 'x64']];
      expect(canRunJob(workflowLabels, runnerLabels, false, true)).toBe(true);
    });

    it('should match with bidirectionalLabelMatch=true when labels are completely shuffled.', () => {
      const workflowLabels = ['x64', 'ubuntu-latest', 'self-hosted', 'linux'];
      const runnerLabels = [['self-hosted', 'linux', 'x64', 'ubuntu-latest']];
      expect(canRunJob(workflowLabels, runnerLabels, false, true)).toBe(true);
    });

    it('should match with bidirectionalLabelMatch=true ignoring case.', () => {
      const workflowLabels = ['Self-Hosted', 'Linux', 'X64'];
      const runnerLabels = [['self-hosted', 'linux', 'x64']];
      expect(canRunJob(workflowLabels, runnerLabels, false, true)).toBe(true);
    });

    it('should NOT match empty workflow labels with bidirectionalLabelMatch=true.', () => {
      const workflowLabels: string[] = [];
      const runnerLabels = [['self-hosted', 'linux', 'x64']];
      expect(canRunJob(workflowLabels, runnerLabels, false, true)).toBe(false);
    });

    it('bidirectionalLabelMatch takes precedence over exactMatch when both are true.', () => {
      const workflowLabels = ['self-hosted', 'linux', 'x64'];
      const runnerLabels = [['self-hosted', 'linux', 'x64', 'ubuntu-latest']];
      // exactMatch alone would accept this (runner has extra labels), but bidirectional should reject
      expect(canRunJob(workflowLabels, runnerLabels, true, true)).toBe(false);
    });
  });

  describe('per-matcher dynamic labels handling', () => {
    const baseRunner = runnerConfig[0];

    it('strips invalid ghr- labels (too long, bad chars) before policy and dispatch', async () => {
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
          labels: ['self-hosted', 'linux', 'ghr-valid:value', 'ghr-bad label', longLabel],
        },
      } as unknown as WorkflowJobEvent;
      const resp = await dispatch(event, 'workflow_job', config);
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).toHaveBeenCalledWith(
        expect.objectContaining({ labels: ['self-hosted', 'linux', 'ghr-valid:value'] }),
      );
    });

    it('rejects the job (202) when the only matching runner has enableDynamicLabels=false', async () => {
      config = await createConfig(undefined, [
        {
          ...baseRunner,
          matcherConfig: {
            labelMatchers: [['self-hosted', 'linux']],
            exactMatch: true,
            enableDynamicLabels: false,
          },
        },
      ]);
      const event = {
        ...workFlowJobEvent,
        workflow_job: {
          ...workFlowJobEvent.workflow_job,
          labels: ['self-hosted', 'linux', 'ghr-ec2-instance-type:t3.large'],
        },
      } as unknown as WorkflowJobEvent;
      const resp = await dispatch(event, 'workflow_job', config);
      expect(resp.statusCode).toBe(202);
      expect(sendActionRequest).not.toHaveBeenCalled();
    });

    it('keeps dynamic labels when the matched runner enables them and has no policy', async () => {
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
          labels: ['self-hosted', 'linux', 'ghr-ec2-instance-type:t3.large'],
        },
      } as unknown as WorkflowJobEvent;
      const resp = await dispatch(event, 'workflow_job', config);
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).toHaveBeenCalledWith(
        expect.objectContaining({ labels: ['self-hosted', 'linux', 'ghr-ec2-instance-type:t3.large'] }),
      );
    });

    it('skips a matching runner whose policy rejects the dynamic labels and uses the next compliant one', async () => {
      config = await createConfig(undefined, [
        {
          ...baseRunner,
          id: 'strict',
          matcherConfig: {
            labelMatchers: [['self-hosted', 'linux']],
            exactMatch: true,
            enableDynamicLabels: true,
            ec2DynamicLabelsPolicy: {
              restricted_keys: {
                'instance-type': { allowed: ['m5.*'] },
              },
            },
          },
        },
        {
          ...baseRunner,
          id: 'permissive',
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
          labels: ['self-hosted', 'linux', 'ghr-ec2-instance-type:t3.large'],
        },
      } as unknown as WorkflowJobEvent;
      const resp = await dispatch(event, 'workflow_job', config);
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          queueId: 'permissive',
          labels: ['self-hosted', 'linux', 'ghr-ec2-instance-type:t3.large'],
        }),
      );
    });

    it('rejects the job (202) when no runner accepts the policy', async () => {
      config = await createConfig(undefined, [
        {
          ...baseRunner,
          id: 'first',
          matcherConfig: {
            labelMatchers: [['self-hosted', 'linux']],
            exactMatch: true,
            enableDynamicLabels: true,
            ec2DynamicLabelsPolicy: {
              restricted_keys: {
                'instance-type': { allowed: ['m5.*'] },
              },
            },
          },
        },
        {
          ...baseRunner,
          id: 'second',
          matcherConfig: {
            labelMatchers: [['self-hosted', 'linux']],
            exactMatch: true,
            enableDynamicLabels: false,
          },
        },
      ]);
      const event = {
        ...workFlowJobEvent,
        workflow_job: {
          ...workFlowJobEvent.workflow_job,
          labels: ['self-hosted', 'linux', 'ghr-ec2-instance-type:t3.large'],
        },
      } as unknown as WorkflowJobEvent;
      const resp = await dispatch(event, 'workflow_job', config);
      expect(resp.statusCode).toBe(202);
      expect(sendActionRequest).not.toHaveBeenCalled();
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
            ec2DynamicLabelsPolicy: {},
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
