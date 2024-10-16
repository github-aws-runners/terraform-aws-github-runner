import { Webhooks } from '@octokit/webhooks';
import { getParameter } from '@aws-github-runner/aws-ssm-util';
import { mocked } from 'jest-mock';
import nock from 'nock';

import workFlowJobEvent from '../../test/resources/github_workflowjob_event.json';

import { RunnerConfig } from '../sqs';
import { checkBodySize, handle } from '.';
import { dispatch } from '../runners/dispatch';
import { IncomingHttpHeaders } from 'http';
import { ConfigWebhook, ConfigWebhookEventBridge } from '../ConfigLoader';

jest.mock('../sqs');
jest.mock('../runners/dispatch');
jest.mock('@aws-github-runner/aws-ssm-util');

const GITHUB_APP_WEBHOOK_SECRET = 'TEST_SECRET';

const cleanEnv = process.env;

const webhooks = new Webhooks({
  secret: 'TEST_SECRET',
});

describe('handle GitHub webhook events', () => {
  let config: ConfigWebhook;

  beforeEach(async () => {
    process.env = { ...cleanEnv };

    nock.disableNetConnect();

    jest.clearAllMocks();
    jest.resetAllMocks();

    ConfigWebhook.reset();
    mockSSMResponse();
    process.env.EVENT_BUS_NAME = 'test';
    config = await ConfigWebhook.load();
  });

  it('should return 500 if no signature available', async () => {
    await expect(handle({}, '', config)).rejects.toMatchObject({
      statusCode: 500,
    });
  });

  it('should accept large events', async () => {
    // setup
    mocked(dispatch).mockImplementation(() => {
      return Promise.resolve({ body: 'test', statusCode: 201 });
    });

    const event = JSON.stringify(workFlowJobEvent);

    // act and assert
    const result = handle(
      {
        'X-Hub-Signature-256': await webhooks.sign(event),
        'X-GitHub-Event': 'workflow_job',
        'content-length': (1024 * 256 + 1).toString(),
      },
      event,
      config,
    );
    expect(result).resolves.toMatchObject({
      statusCode: 201,
    });
  });

  it('should reject with 403 if invalid signature', async () => {
    const event = JSON.stringify(workFlowJobEvent);
    const other = JSON.stringify({ ...workFlowJobEvent, action: 'mutated' });

    await expect(
      handle({ 'X-Hub-Signature-256': await webhooks.sign(other), 'X-GitHub-Event': 'workflow_job' }, event, config),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('should reject with 202 if event type is not supported', async () => {
    const event = JSON.stringify(workFlowJobEvent);

    await expect(
      handle({ 'X-Hub-Signature-256': await webhooks.sign(event), 'X-GitHub-Event': 'invalid' }, event, config),
    ).rejects.toMatchObject({
      statusCode: 202,
    });
  });

  it('should accept with 201 if valid signature', async () => {
    const event = JSON.stringify(workFlowJobEvent);

    mocked(dispatch).mockImplementation(() => {
      return Promise.resolve({ body: 'test', statusCode: 201 });
    });

    await expect(
      handle({ 'X-Hub-Signature-256': await webhooks.sign(event), 'X-GitHub-Event': 'workflow_job' }, event, config),
    ).resolves.toMatchObject({
      statusCode: 201,
    });
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
      fifo: false,
      matcherConfig: {
        labelMatchers: [['label1', 'label2']],
        exactMatch: true,
      },
    },
  ];
  mocked(getParameter).mockImplementation(async (paramPath: string) => {
    if (paramPath === '/path/to/matcher/config') {
      return JSON.stringify(matcherConfig);
    }
    if (paramPath === '/path/to/webhook/secret') {
      return GITHUB_APP_WEBHOOK_SECRET;
    }
    throw new Error('Parameter not found');
  });
}
