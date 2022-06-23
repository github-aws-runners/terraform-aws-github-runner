import { Webhooks } from '@octokit/webhooks';
import { mocked } from 'jest-mock';
import nock from 'nock';

import checkrun_event from '../../test/resources/github_check_run_event.json';
import workflowjob_event from '../../test/resources/github_workflowjob_event.json';
import { sendActionRequest } from '../sqs';
import { getParameterValue } from '../ssm';
import { handle } from './handler';

jest.mock('../sqs');
jest.mock('../ssm');

const GITHUB_APP_WEBHOOK_SECRET = 'TEST_SECRET';

const secret = 'TEST_SECRET';
const webhooks = new Webhooks({
  secret: secret,
});

describe('handler', () => {
  let originalError: Console['error'];

  beforeEach(() => {
    nock.disableNetConnect();
    process.env.REPOSITORY_WHITE_LIST = '[]';
    originalError = console.error;
    console.error = jest.fn();
    jest.clearAllMocks();
    jest.resetAllMocks();

    const mockedGet = mocked(getParameterValue);
    mockedGet.mockResolvedValueOnce(GITHUB_APP_WEBHOOK_SECRET);
  });

  afterEach(() => {
    console.error = originalError;
  });

  it('returns 500 if no signature available', async () => {
    const resp = await handle({}, '');
    expect(resp.statusCode).toBe(500);
  });

  it('returns 401 if signature is invalid', async () => {
    const resp = await handle({ 'X-Hub-Signature': 'bbb' }, 'aaaa');
    expect(resp.statusCode).toBe(401);
  });

  describe('Test for workflowjob event: ', () => {
    beforeEach(() => {
      process.env.DISABLE_CHECK_WORKFLOW_JOB_LABELS = 'false';
    });
    it('handles workflow job events', async () => {
      const event = JSON.stringify(workflowjob_event);
      const resp = await handle(
        { 'X-Hub-Signature': await webhooks.sign(event), 'X-GitHub-Event': 'workflow_job' },
        event,
      );
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).toBeCalled();
    });

    it('does not handle other events', async () => {
      const event = JSON.stringify(workflowjob_event);
      const resp = await handle({ 'X-Hub-Signature': await webhooks.sign(event), 'X-GitHub-Event': 'push' }, event);
      expect(resp.statusCode).toBe(202);
      expect(sendActionRequest).not.toBeCalled();
    });

    it('does not handle workflow_job events with actions other than queued (action = started)', async () => {
      const event = JSON.stringify({ ...workflowjob_event, action: 'started' });
      const resp = await handle(
        { 'X-Hub-Signature': await webhooks.sign(event), 'X-GitHub-Event': 'workflow_job' },
        event,
      );
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).not.toBeCalled();
    });

    it('does not handle workflow_job events with actions other than queued (action = completed)', async () => {
      const event = JSON.stringify({ ...workflowjob_event, action: 'completed' });
      const resp = await handle(
        { 'X-Hub-Signature': await webhooks.sign(event), 'X-GitHub-Event': 'workflow_job' },
        event,
      );
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).not.toBeCalled();
    });

    it('does not handle workflow_job events from unlisted repositories', async () => {
      const event = JSON.stringify(workflowjob_event);
      process.env.REPOSITORY_WHITE_LIST = '["NotCodertocat/Hello-World"]';
      const resp = await handle(
        { 'X-Hub-Signature': await webhooks.sign(event), 'X-GitHub-Event': 'workflow_job' },
        event,
      );
      expect(resp.statusCode).toBe(403);
      expect(sendActionRequest).not.toBeCalled();
    });

    it('handles workflow_job events without installation id', async () => {
      const event = JSON.stringify({ ...workflowjob_event, installation: null });
      process.env.REPOSITORY_WHITE_LIST = '["philips-labs/terraform-aws-github-runner"]';
      const resp = await handle(
        { 'X-Hub-Signature': await webhooks.sign(event), 'X-GitHub-Event': 'workflow_job' },
        event,
      );
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).toBeCalled();
    });

    it('handles workflow_job events from whitelisted repositories', async () => {
      const event = JSON.stringify(workflowjob_event);
      process.env.REPOSITORY_WHITE_LIST = '["philips-labs/terraform-aws-github-runner"]';
      const resp = await handle(
        { 'X-Hub-Signature': await webhooks.sign(event), 'X-GitHub-Event': 'workflow_job' },
        event,
      );
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).toBeCalled();
    });

    it('Check runner labels accept test job', async () => {
      process.env.RUNNER_LABELS = '["self-hosted",  "test"]';
      process.env.ENABLE_WORKFLOW_JOB_LABELS_CHECK = 'true';
      process.env.WORKFLOW_JOB_LABELS_CHECK_ALL = 'true';
      const event = JSON.stringify({
        ...workflowjob_event,
        workflow_job: {
          ...workflowjob_event.workflow_job,
          labels: ['self-hosted', 'test'],
        },
      });
      const resp = await handle(
        { 'X-Hub-Signature': await webhooks.sign(event), 'X-GitHub-Event': 'workflow_job' },
        event,
      );
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).toBeCalled();
    });

    it('Check runner labels accept job with mixed order.', async () => {
      process.env.RUNNER_LABELS = '["linux", "test", "self-hosted"]';
      process.env.ENABLE_WORKFLOW_JOB_LABELS_CHECK = 'true';
      process.env.WORKFLOW_JOB_LABELS_CHECK_ALL = 'true';
      const event = JSON.stringify({
        ...workflowjob_event,
        workflow_job: {
          ...workflowjob_event.workflow_job,
          labels: ['linux', 'self-hosted', 'test'],
        },
      });
      const resp = await handle(
        { 'X-Hub-Signature': await webhooks.sign(event), 'X-GitHub-Event': 'workflow_job' },
        event,
      );
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).toBeCalled();
    });

    it('Check webhook does not accept jobs where not all labels are provided in job.', async () => {
      process.env.RUNNER_LABELS = '["self-hosted", "test", "test2"]';
      process.env.ENABLE_WORKFLOW_JOB_LABELS_CHECK = 'true';
      process.env.WORKFLOW_JOB_LABELS_CHECK_ALL = 'true';
      const event = JSON.stringify({
        ...workflowjob_event,
        workflow_job: {
          ...workflowjob_event.workflow_job,
          labels: ['self-hosted'],
        },
      });
      const resp = await handle(
        { 'X-Hub-Signature': await webhooks.sign(event), 'X-GitHub-Event': 'workflow_job' },
        event,
      );
      expect(resp.statusCode).toBe(202);
      expect(sendActionRequest).not.toBeCalled;
    });

    it('Check webhook does not accept jobs where not all labels are supported by the runner.', async () => {
      process.env.RUNNER_LABELS = '["self-hosted", "x64", "linux", "test"]';
      process.env.ENABLE_WORKFLOW_JOB_LABELS_CHECK = 'true';
      process.env.WORKFLOW_JOB_LABELS_CHECK_ALL = 'true';
      const event = JSON.stringify({
        ...workflowjob_event,
        workflow_job: {
          ...workflowjob_event.workflow_job,
          labels: ['self-hosted', 'linux', 'x64', 'test', 'gpu'],
        },
      });
      const resp = await handle(
        { 'X-Hub-Signature': await webhooks.sign(event), 'X-GitHub-Event': 'workflow_job' },
        event,
      );
      expect(resp.statusCode).toBe(202);
      expect(sendActionRequest).not.toBeCalled;
    });

    it('Check webhook will accept jobs with a single acceptable label.', async () => {
      process.env.RUNNER_LABELS = '["self-hosted", "x64", "linux", "test"]';
      process.env.ENABLE_WORKFLOW_JOB_LABELS_CHECK = 'true';
      process.env.WORKFLOW_JOB_LABELS_CHECK_ALL = 'false';
      const event = JSON.stringify({
        ...workflowjob_event,
        workflow_job: {
          ...workflowjob_event.workflow_job,
          labels: ['x64'],
        },
      });
      const resp = await handle(
        { 'X-Hub-Signature': await webhooks.sign(event), 'X-GitHub-Event': 'workflow_job' },
        event,
      );
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).toBeCalled();
    });

    it('Check webhook will not accept jobs without correct label when job label check all is false.', async () => {
      process.env.RUNNER_LABELS = '["self-hosted", "x64", "linux", "test"]';
      process.env.ENABLE_WORKFLOW_JOB_LABELS_CHECK = 'true';
      process.env.WORKFLOW_JOB_LABELS_CHECK_ALL = 'false';
      const event = JSON.stringify({
        ...workflowjob_event,
        workflow_job: {
          ...workflowjob_event.workflow_job,
          labels: ['ubuntu-latest'],
        },
      });
      const resp = await handle(
        { 'X-Hub-Signature': await webhooks.sign(event), 'X-GitHub-Event': 'workflow_job' },
        event,
      );
      expect(resp.statusCode).toBe(202);
      expect(sendActionRequest).not.toBeCalled;
    });
  });

  describe('Test for check_run event (legacy): ', () => {
    it('handles check_run events', async () => {
      const event = JSON.stringify(checkrun_event);
      const resp = await handle(
        { 'X-Hub-Signature': await webhooks.sign(event), 'X-GitHub-Event': 'check_run' },
        event,
      );
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).toBeCalled();
    });

    it('does not handle check_run events with actions other than queued (action = started)', async () => {
      const event = JSON.stringify({ ...checkrun_event, action: 'started' });
      const resp = await handle(
        { 'X-Hub-Signature': await webhooks.sign(event), 'X-GitHub-Event': 'check_run' },
        event,
      );
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).not.toBeCalled();
    });

    it('does not handle check_run events with actions other than queued (action = completed)', async () => {
      const event = JSON.stringify({ ...checkrun_event, action: 'completed' });
      const resp = await handle(
        { 'X-Hub-Signature': await webhooks.sign(event), 'X-GitHub-Event': 'check_run' },
        event,
      );
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).not.toBeCalled();
    });

    it('does not handle check_run events from unlisted repositories', async () => {
      const event = JSON.stringify(checkrun_event);
      process.env.REPOSITORY_WHITE_LIST = '["NotCodertocat/Hello-World"]';
      const resp = await handle(
        { 'X-Hub-Signature': await webhooks.sign(event), 'X-GitHub-Event': 'check_run' },
        event,
      );
      expect(resp.statusCode).toBe(403);
      expect(sendActionRequest).not.toBeCalled();
    });

    it('handles check_run events from whitelisted repositories', async () => {
      const event = JSON.stringify(checkrun_event);
      process.env.REPOSITORY_WHITE_LIST = '["Codertocat/Hello-World"]';
      const resp = await handle(
        { 'X-Hub-Signature': await webhooks.sign(event), 'X-GitHub-Event': 'check_run' },
        event,
      );
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).toBeCalled();
    });

    it('handles check_run events with no installation id.', async () => {
      const event = JSON.stringify({ ...checkrun_event, installation: { id: null } });
      const resp = await handle(
        { 'X-Hub-Signature': await webhooks.sign(event), 'X-GitHub-Event': 'check_run' },
        event,
      );
      expect(resp.statusCode).toBe(201);
      expect(sendActionRequest).toBeCalled();
    });
  });
});
