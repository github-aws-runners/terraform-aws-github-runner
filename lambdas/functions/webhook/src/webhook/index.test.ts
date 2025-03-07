import { Webhooks } from '@octokit/webhooks';
import { getParameter } from '@aws-github-runner/aws-ssm-util';

import nock from 'nock';

import workFlowJobEvent from '../../test/resources/github_workflowjob_event.json';

import { checkBodySize, publishForRunners, publishOnEventBridge } from '.';
import { dispatch } from '../runners/dispatch';
import { IncomingHttpHeaders } from 'http';
import { ConfigWebhook, ConfigWebhookEventBridge } from '../ConfigLoader';
import { publish } from '../eventbridge';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../sqs');
vi.mock('../eventbridge');
vi.mock('../runners/dispatch');
vi.mock('@aws-github-runner/aws-ssm-util');

const GITHUB_APP_WEBHOOK_SECRET = 'TEST_SECRET';

const cleanEnv = process.env;

const webhooks = new Webhooks({
  secret: 'TEST_SECRET',
});

describe('handle GitHub webhook events', () => {
  beforeEach(async () => {
    process.env = { ...cleanEnv };

    nock.disableNetConnect();
    vi.clearAllMocks();

    mockSSMResponse();
  });

  describe('handle and dispatch webhook events to build queues', () => {
    let config: ConfigWebhook;
    beforeEach(async () => {
      ConfigWebhook.reset();
      process.env.EVENT_BUS_NAME = 'test';
      config = await ConfigWebhook.load();
    });

    it('should return 500 if no signature available', async () => {
      await expect(publishForRunners({}, '', config)).rejects.toMatchObject({
        statusCode: 500,
      });
    });

    it('should accept large events', async () => {
      // setup
      vi.mocked(dispatch).mockImplementation(() => {
        return Promise.resolve({ body: 'test', statusCode: 201 });
      });

      const event = JSON.stringify(workFlowJobEvent);

      // act and assert
      const result = publishForRunners(
        {
          'X-Hub-Signature-256': await webhooks.sign(event),
          'X-GitHub-Event': 'workflow_job',
          'content-length': (1024 * 256 + 1).toString(),
        },
        event,
        config,
      );
      await expect(result).resolves.toMatchObject({
        statusCode: 201,
      });
    });

    it('should reject with 403 if invalid signature', async () => {
      const event = JSON.stringify(workFlowJobEvent);
      const other = JSON.stringify({ ...workFlowJobEvent, action: 'mutated' });

      await expect(
        publishForRunners(
          { 'X-Hub-Signature-256': await webhooks.sign(other), 'X-GitHub-Event': 'workflow_job' },
          event,
          config,
        ),
      ).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('should reject with 202 if event type is not supported', async () => {
      const event = JSON.stringify(workFlowJobEvent);

      await expect(
        publishForRunners(
          { 'X-Hub-Signature-256': await webhooks.sign(event), 'X-GitHub-Event': 'invalid' },
          event,
          config,
        ),
      ).rejects.toMatchObject({
        statusCode: 202,
      });
    });

    it('should accept with 201 if valid signature', async () => {
      const event = JSON.stringify(workFlowJobEvent);

      vi.mocked(dispatch).mockImplementation(() => {
        return Promise.resolve({ body: 'test', statusCode: 201 });
      });

      await expect(
        publishForRunners(
          { 'X-Hub-Signature-256': await webhooks.sign(event), 'X-GitHub-Event': 'workflow_job' },
          event,
          config,
        ),
      ).resolves.toMatchObject({
        statusCode: 201,
      });
    });
  });

  describe('handle webhook events and forward to eventbridge', () => {
    let config: ConfigWebhookEventBridge;
    beforeEach(async () => {
      ConfigWebhookEventBridge.reset();
      process.env.EVENT_BUS_NAME = 'test';
      config = await ConfigWebhookEventBridge.load();
    });

    it('should return 500 if no signature available', async () => {
      await expect(publishOnEventBridge({}, '', config)).rejects.toMatchObject({
        statusCode: 500,
      });
    });

    it('should publish too large events on an error channel.,', async () => {
      // setup
      vi.mocked(publish).mockImplementation(async () => {
        return Promise.resolve();
      });

      const event = JSON.stringify(workFlowJobEvent);

      // act and assert
      await publishOnEventBridge(
        {
          'X-Hub-Signature-256': await webhooks.sign(event),
          'X-GitHub-Event': 'workflow_job',
          'content-length': (1024 * 256 + 1).toString(),
        },
        event,
        config,
      );

      expect(publish).toHaveBeenCalledWith(
        expect.objectContaining({
          Source: 'runners.webhook',
          EventBusName: 'test',
          DetailType: 'error.workflow_job',
          Detail: expect.objectContaining({
            error: 'Body size exceeded 256KB',
            size: expect.any(Number),
          }),
        }),
      );
    });

    it('should reject with 403 if invalid signature', async () => {
      const event = JSON.stringify(workFlowJobEvent);
      const other = JSON.stringify({ ...workFlowJobEvent, action: 'mutated' });

      await expect(
        publishOnEventBridge(
          { 'X-Hub-Signature-256': await webhooks.sign(other), 'X-GitHub-Event': 'workflow_job' },
          event,
          config,
        ),
      ).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    interface TestInput {
      events: string[];
      eventType: string;
    }

    it.each([
      { events: [], eventType: 'workflow_job' },
      { events: ['workflow_job', 'workflow_run'], eventType: 'workflow_run' },
    ])('should accept $eventType for allowed events list $events', async (input: TestInput) => {
      const event = JSON.stringify(workFlowJobEvent);

      vi.mocked(dispatch).mockImplementation(() => {
        return Promise.resolve({ body: 'test', statusCode: 201 });
      });

      ConfigWebhookEventBridge.reset();
      process.env.ACCEPT_EVENTS = JSON.stringify(input.events);
      config = await ConfigWebhookEventBridge.load();

      await expect(
        publishOnEventBridge(
          { 'X-Hub-Signature-256': await webhooks.sign(event), 'X-GitHub-Event': input.eventType },
          event,
          config,
        ),
      ).resolves.toMatchObject({
        statusCode: 201,
      });
    });

    it('should throw if publish to bridge failes.,', async () => {
      // setup
      vi.mocked(publish).mockRejectedValue(new Error('test'));
      const event = JSON.stringify(workFlowJobEvent);

      // act and assert
      await expect(
        publishOnEventBridge(
          {
            'X-Hub-Signature-256': await webhooks.sign(event),
            'X-GitHub-Event': 'workflow_job',
            'content-length': (1024 * 256 + 1).toString(),
          },
          event,
          config,
        ),
      ).rejects.toThrow('test');
    });

    it.each([{ events: ['workflow_job', 'workflow_run'], eventType: 'push' }])(
      'should reject $eventType when not in allowed events list $events',
      async (input: TestInput) => {
        const event = JSON.stringify(workFlowJobEvent);

        vi.mocked(dispatch).mockImplementation(() => {
          return Promise.resolve({ body: 'test', statusCode: 201 });
        });

        ConfigWebhookEventBridge.reset();
        process.env.ACCEPT_EVENTS = JSON.stringify(input.events);
        config = await ConfigWebhookEventBridge.load();

        await expect(
          publishOnEventBridge(
            { 'X-Hub-Signature-256': await webhooks.sign(event), 'X-GitHub-Event': input.eventType },
            event,
            config,
          ),
        ).rejects.toMatchObject({
          statusCode: 202,
        });
      },
    );
  });
});

describe('Check message size (checkBodySize)', () => {
  it('should return sizeExceeded if body is to big', () => {
    const body = JSON.stringify({ a: 'a'.repeat(1024 * 256) });
    const headers: IncomingHttpHeaders = {
      'content-length': Buffer.byteLength(body).toString(),
    };
    const result = checkBodySize(body, headers);
    expect(result.sizeExceeded).toBe(true);
  });

  it('should return sizeExceeded if body is to big and content-length is not available', () => {
    const body = JSON.stringify({ a: 'a'.repeat(1024 * 256) });
    const headers: IncomingHttpHeaders = {};
    const result = checkBodySize(body, headers);
    expect(result.sizeExceeded).toBe(true);
  });

  it('should return sizeExceeded if body is to big and content-length is not a number', () => {
    const body = JSON.stringify({ a: 'a'.repeat(1024 * 256) });
    const headers: IncomingHttpHeaders = {
      'content-length': 'NaN',
    };
    const result = checkBodySize(body, headers);
    expect(result.sizeExceeded).toBe(true);
  });
});

function mockSSMResponse() {
  process.env.PARAMETER_RUNNER_MATCHER_CONFIG_PATH = '/path/to/matcher/config';
  process.env.PARAMETER_GITHUB_APP_WEBHOOK_SECRET = '/path/to/webhook/secret';
  const matcherConfig = [
    {
      id: '1',
      arn: 'arn:aws:sqs:us-east-1:123456789012:queue1',
      matcherConfig: {
        labelMatchers: [['label1', 'label2']],
        exactMatch: true,
      },
    },
  ];
  vi.mocked(getParameter).mockImplementation(async (paramPath: string) => {
    if (paramPath === '/path/to/matcher/config') {
      return JSON.stringify(matcherConfig);
    }
    if (paramPath === '/path/to/webhook/secret') {
      return GITHUB_APP_WEBHOOK_SECRET;
    }
    throw new Error('Parameter not found');
  });
}
