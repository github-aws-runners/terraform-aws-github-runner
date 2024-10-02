import { Webhooks } from '@octokit/webhooks';
import { getParameter } from '@aws-github-runner/aws-ssm-util';
import { mocked } from 'jest-mock';
import nock from 'nock';

import workFlowJobEvent from '../../test/resources/github_workflowjob_event.json';
import runnerConfig from '../../test/resources/multi_runner_configurations.json';

import { RunnerConfig, sendWebhookEventToWorkflowJobQueue } from '../sqs';
import { handle } from '.';
import { Config } from '../ConfigResolver';
import { dispatch as dispatch } from '../runners/dispatch';

jest.mock('../sqs');
jest.mock('../runners/dispatch');
jest.mock('@aws-github-runner/aws-ssm-util');

const GITHUB_APP_WEBHOOK_SECRET = 'TEST_SECRET';

const cleanEnv = process.env;

const webhooks = new Webhooks({
  secret: 'TEST_SECRET',
});

const sendWebhookEventToWorkflowJobQueueMock = jest.mocked(sendWebhookEventToWorkflowJobQueue);

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
    expect(sendWebhookEventToWorkflowJobQueueMock).not.toHaveBeenCalled();
  });

  it('should reject with 403 if invalid signature', async () => {
    const event = JSON.stringify(workFlowJobEvent);
    const other = JSON.stringify({ ...workFlowJobEvent, action: 'mutated' });

    await expect(
      handle({ 'X-Hub-Signature-256': await webhooks.sign(other), 'X-GitHub-Event': 'workflow_job' }, event, config),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(sendWebhookEventToWorkflowJobQueueMock).not.toHaveBeenCalled();
  });

  it('should reject with 202 if event type is not supported', async () => {
    const event = JSON.stringify(workFlowJobEvent);

    await expect(
      handle({ 'X-Hub-Signature-256': await webhooks.sign(event), 'X-GitHub-Event': 'invalid' }, event, config),
    ).rejects.toMatchObject({
      statusCode: 202,
    });
    expect(sendWebhookEventToWorkflowJobQueueMock).not.toHaveBeenCalled();
  });

  it('should reject with 201 if valid signature', async () => {
    const event = JSON.stringify(workFlowJobEvent);

    mocked(dispatch).mockImplementation(() => {
      return Promise.resolve({ body: 'test', statusCode: 201 });
    });

    await expect(
      handle({ 'X-Hub-Signature-256': await webhooks.sign(event), 'X-GitHub-Event': 'workflow_job' }, event, config),
    ).resolves.toMatchObject({
      statusCode: 201,
    });
    expect(sendWebhookEventToWorkflowJobQueueMock).toHaveBeenCalled();
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
