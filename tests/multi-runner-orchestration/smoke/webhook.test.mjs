import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  assertEc2RunnerCount,
  assertCloudWatchLogContains,
  invokeLambda,
  postWebhook,
  terraformOutput,
} from './support.mjs';

const testTimeout = Number(process.env.MINISTACK_SMOKE_TIMEOUT_MS ?? 7200000);
const scaleDownFunction = 'multi-runner-webhook-ec2-scale-down';
const scaleDownLogGroup = '/aws/lambda/multi-runner-webhook-ec2-scale-down';
let nextJobId = 0;

function createWorkflowJobEvent(jobId, labels) {
  const repositoryName = 'test-owner/test-repo';
  const jobUrl = `https://github.example.invalid/${repositoryName}/actions/jobs/${jobId}`;
  const workflowRunUrl = `https://github.example.invalid/${repositoryName}/actions/runs/654321`;

  return {
    action: 'queued',
    installation: { id: 123 },
    repository: {
      full_name: repositoryName,
      id: 1,
      name: 'test-repo',
      owner: { login: 'test-owner', type: 'Organization' },
    },
    workflow_job: {
      conclusion: null,
      html_url: jobUrl,
      id: jobId,
      labels,
      name: `node-smoke-${jobId}`,
      run_id: 654321,
      run_url: workflowRunUrl,
      status: 'queued',
      url: jobUrl,
    },
  };
}

async function sendWorkflowJob(labels) {
  const endpoint = process.env.MINISTACK_WEBHOOK_ENDPOINT
    ?? await terraformOutput('webhook_endpoint');
  const secret = process.env.MINISTACK_WEBHOOK_SECRET
    ?? await terraformOutput('webhook_secret');
  const jobId = Number(process.env.MINISTACK_SMOKE_JOB_ID ?? Date.now().toString().slice(-8))
    + nextJobId;
  nextJobId += 1;

  const eventBody = Buffer.from(JSON.stringify(createWorkflowJobEvent(jobId, labels)));
  const signature = createHmac('sha256', secret).update(eventBody).digest('hex');
  const webhookUrl = new URL(endpoint);
  const startTime = Date.now() - 1000;
  const response = await postWebhook(
    webhookUrl.host,
    `${webhookUrl.pathname}${webhookUrl.search}`,
    {
      'content-type': 'application/json',
      'x-github-event': 'workflow_job',
      'x-github-delivery': `node-smoke-${randomUUID()}`,
      'x-github-hook-installation-target-id': '123',
      'x-hub-signature-256': `sha256=${signature}`,
    },
    eventBody,
  );

  assert.ok(
    [200, 201].includes(response.status),
    `Webhook failed with HTTP ${response.status}: ${response.body}`,
  );

  const handlers = [
    ['/aws/lambda/multi-runner-webhook-webhook', 'webhook'],
    ['/aws/lambda/multi-runner-webhook-dispatch-to-runner', 'dispatch-to-runner'],
    ['/aws/lambda/multi-runner-webhook-ec2-scale-up', 'scale-up'],
  ];

  for (const [logGroup, handler] of handlers) {
    await assertCloudWatchLogContains(
      logGroup,
      `${handler} handler logged job ${jobId}`,
      jobId,
      startTime,
    );
  }

  await assertCloudWatchLogContains(
    '/aws/lambda/multi-runner-webhook-ec2-scale-up',
    `scale-up handler successfully created a runner for job ${jobId}`,
    '"successfulRunnerCount":1,"retryableErrorCount":0',
    startTime,
  );
  await assertEc2RunnerCount(1);

  return { jobId, startTime };
}

async function scaleDown(description, startTime) {
  // MiniStack does not boot the EC2 runner agent to register it with GitHub.
  // The first scheduled cleanup marks it orphaned; the next confirms GitHub
  // has no such runner and terminates the EC2 instance.
  await invokeLambda(scaleDownFunction);
  await invokeLambda(scaleDownFunction);
  await assertCloudWatchLogContains(
    scaleDownLogGroup,
    `${description} runner instance was terminated`,
    'has been terminated.',
    startTime,
  );
  await assertEc2RunnerCount(0);
}

test('Webhook: standard labels create and terminate a runner', {
  timeout: testTimeout,
}, async () => {
  await assertEc2RunnerCount(0);
  const { jobId } = await sendWorkflowJob(['self-hosted', 'linux', 'x64', 'ec2']);
  const scaleDownStartTime = Date.now() - 1000;
  await scaleDown(`standard-label job ${jobId}`, scaleDownStartTime);
});

test('Webhook: dynamic labels apply m5.large and terminate the runner', {
  timeout: testTimeout,
}, async () => {
  await assertEc2RunnerCount(0);
  const dynamicLabel = 'ghr-ec2-instance-type:m5.large';
  const { jobId, startTime } = await sendWorkflowJob([
    'self-hosted', 'linux', 'x64', 'ec2', dynamicLabel,
  ]);
  await assertCloudWatchLogContains(
    '/aws/lambda/multi-runner-webhook-ec2-scale-up',
    `scale-up applied dynamic label ${dynamicLabel} for job ${jobId}`,
    '"ec2OverrideConfig":{"InstanceType":"m5.large"}',
    startTime,
  );
  const scaleDownStartTime = Date.now() - 1000;
  await scaleDown(`dynamic-label job ${jobId}`, scaleDownStartTime);
});

test('Pool: create and terminate one runner', {
  timeout: testTimeout,
}, async () => {
  await assertEc2RunnerCount(0);
  const startTime = Date.now() - 1000;
  await invokeLambda('multi-runner-webhook-ec2-pool', { poolSize: 1, type: 'ec2' });
  await assertCloudWatchLogContains(
    '/aws/lambda/multi-runner-webhook-ec2-pool',
    'pool handler requested one runner',
    'The pool will be topped up with 1 runners.',
    startTime,
  );
  await assertEc2RunnerCount(1);

  const scaleDownStartTime = Date.now() - 1000;
  await scaleDown('pool', scaleDownStartTime);
});
