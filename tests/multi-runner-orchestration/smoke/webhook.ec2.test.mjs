import { test } from 'node:test';
import {
  assertEc2RunnerCount,
  assertCloudWatchLogContains,
  invokeLambda,
  sendWorkflowJob,
} from './support.mjs';

const testTimeout = Number(process.env.MINISTACK_SMOKE_TIMEOUT_MS ?? 7200000);
const scaleDownFunction = 'multi-runner-webhook-ec2-scale-down';
const scaleDownLogGroup = '/aws/lambda/multi-runner-webhook-ec2-scale-down';

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

test('EC2 Webhook: standard labels create and terminate a runner', {
  timeout: testTimeout,
}, async () => {
  await assertEc2RunnerCount(0);
  const { jobId } = await sendWorkflowJob(['self-hosted', 'linux', 'x64', 'ec2']);
  await assertEc2RunnerCount(1);
  const scaleDownStartTime = Date.now() - 1000;
  await scaleDown(`standard-label job ${jobId}`, scaleDownStartTime);
});

test('EC2 Webhook: dynamic labels apply m5.large and terminate the runner', {
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

test('EC2 Pool: create and terminate one runner', {
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
