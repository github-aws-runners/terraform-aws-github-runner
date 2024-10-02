import { Webhooks } from '@octokit/webhooks';
import { getParameter } from '@aws-github-runner/aws-ssm-util';
import { mocked } from 'jest-mock';
import nock from 'nock';

import workFlowJobEvent from '../../test/resources/github_workflowjob_event.json';
import runnerConfig from '../../test/resources/multi_runner_configurations.json';

import { RunnerConfig } from '../sqs';
import { checkBodySize, handle } from '.';
import { Config } from '../ConfigResolver';
import { dispatch } from '../runners/dispatch';
import { IncomingHttpHeaders } from 'http';

jest.mock('../sqs');
jest.mock('../runners/dispatch');
jest.mock('@aws-github-runner/aws-ssm-util');

const GITHUB_APP_WEBHOOK_SECRET = 'TEST_SECRET';

const cleanEnv = process.env;

const webhooks = new Webhooks({
  secret: 'TEST_SECRET',
});

describe('handle GitHub webhook events', () => {
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
    config = await Config.load();
  });

  afterEach(() => {
    console.error = originalError;
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
