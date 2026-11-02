import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { aws, logMessages, waitFor } from './support.aws.mjs';
import {
  deployMinimumRunners,
  findScaleSetControllerService,
} from './support.scale-set.mjs';

const testTimeout = Number(process.env.MINISTACK_SMOKE_TIMEOUT_MS ?? 7200000);
const scaleSetRunnerEnvironment = process.env.MINISTACK_SCALE_SET_RUNNER_ENVIRONMENT
  ?? 'multi-runner-webhook-ec2_scalet_set';
const allowedInstanceTypes = ['m7a.large', 'm5.large'];

function messageMatchesEvent(message, eventName, expectedFields) {
  try {
    const event = JSON.parse(message);
    return (event.event === eventName || event.message === eventName)
      && Object.entries(expectedFields).every(([key, value]) => event[key] === value);
  } catch {
    return message.includes(eventName)
      && Object.entries(expectedFields).every(([key, value]) => (
        message.includes(`"${key}":${JSON.stringify(value)}`)
      ));
  }
}

test('EC2 Scale set: baseline at 0, scale up to 1, and scale down to 0 runners', {
  timeout: testTimeout,
}, async () => {
  const controller = await findScaleSetControllerService();
  assert.ok(controller, 'Scale-set controller ECS service/task definition is missing; ensure Compose terraform-apply completed');
  assert.ok(controller.logGroup, 'Scale-set controller task has no CloudWatch log group');
  const controllerEnvironment = new Map(
    (controller.container.environment ?? []).map(({ name, value }) => [name, value]),
  );
  const manifest = JSON.parse(controllerEnvironment.get('SCALE_SET_CONTROLLER_MANIFEST'));
  assert.equal(manifest.reconcilers?.length, 1, 'Expected one scale-set reconciler');

  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'scale-set-smoke-'));
  try {
    const baselineDeployment = await deployMinimumRunners(controller, 0, temporaryDirectory);
    assert.ok(baselineDeployment.taskDefinitionArn, 'MiniStack did not register the baseline scale-set task revision');
    assert.ok(baselineDeployment.streamPrefix && baselineDeployment.taskId, 'MiniStack did not report the baseline controller log stream identity');
    await waitFor('scale-set baseline reconciliation started with zero desired runners', async () => (
      (await logMessages(controller.logGroup, baselineDeployment.startTime, baselineDeployment.logStreamName))
        .find((message) => messageMatchesEvent(
          message,
          'scale_set_compute_provider_reconcile_started',
          { desiredRunners: 0 },
        ))
    ));
    const baselineMessage = await waitFor('scale-set baseline reconciled with zero runners', async () => (
      (await logMessages(controller.logGroup, baselineDeployment.startTime, baselineDeployment.logStreamName))
        .find((message) => messageMatchesEvent(
          message,
          'scale_set_reconciled',
          { desiredRunners: 0 },
        ))
    ));
    const baseline = JSON.parse(baselineMessage);
    assert.equal(baseline.currentRunners, 0, 'Scale-set baseline should have no runners');
    await waitFor('no active EC2 scale-set runners at baseline', async () => {
      const response = await aws(
        'ec2', 'describe-instances',
        '--filters',
        `Name=tag:ghr:environment,Values=${scaleSetRunnerEnvironment}`,
        'Name=instance-state-name,Values=pending,running',
      );
      const instances = (response.Reservations ?? []).flatMap((reservation) => reservation.Instances ?? []);
      return instances.length === 0 ? instances : false;
    });

    const scaleUpDeployment = await deployMinimumRunners(controller, 1, temporaryDirectory);
    assert.ok(scaleUpDeployment.taskDefinitionArn, 'MiniStack did not register the scale-up task revision');
    assert.ok(scaleUpDeployment.streamPrefix && scaleUpDeployment.taskId, 'MiniStack did not report the scale-up controller log stream identity');
    await waitFor('scale-set scale-up reconciliation started with one desired runner', async () => (
      (await logMessages(controller.logGroup, scaleUpDeployment.startTime, scaleUpDeployment.logStreamName))
        .find((message) => messageMatchesEvent(
          message,
          'scale_set_compute_provider_reconcile_started',
          { desiredRunners: 1 },
        ))
    ));
    const scaleUpMessage = await waitFor('scale-set reconciled with one runner', async () => (
      (await logMessages(controller.logGroup, scaleUpDeployment.startTime, scaleUpDeployment.logStreamName))
        .find((message) => messageMatchesEvent(
          message,
          'scale_set_reconciled',
          { desiredRunners: 1 },
        ))
    ));
    const scaleUp = JSON.parse(scaleUpMessage);
    assert.ok(scaleUp.actions?.launched > 0, 'EC2 scale-set scale-up did not launch a runner');
    assert.equal(scaleUp.currentRunners, 1, 'EC2 scale-set scale-up did not reach one runner');
    const launchedInstances = await waitFor('one active EC2 scale-set runner', async () => {
      const response = await aws(
        'ec2', 'describe-instances',
        '--filters',
        `Name=tag:ghr:environment,Values=${scaleSetRunnerEnvironment}`,
        'Name=instance-state-name,Values=pending,running',
      );
      const instances = (response.Reservations ?? []).flatMap((reservation) => reservation.Instances ?? []);
      return instances.length === 1 ? instances : false;
    });
    assert.equal(launchedInstances.length, 1, 'Scale-set should have one active EC2 runner');
    assert.ok(
      allowedInstanceTypes.includes(launchedInstances[0].InstanceType),
      `EC2 scale-set runner ${launchedInstances[0].InstanceId} has type ${launchedInstances[0].InstanceType}; expected ${allowedInstanceTypes.join(' or ')}`,
    );

    const scaleDownDeployment = await deployMinimumRunners(controller, 0, temporaryDirectory);
    assert.ok(scaleDownDeployment.taskDefinitionArn, 'MiniStack did not register the scale-down task revision');
    assert.ok(scaleDownDeployment.streamPrefix && scaleDownDeployment.taskId, 'MiniStack did not report the scale-down controller log stream identity');
    await waitFor('scale-set scale-down reconciliation started with zero desired runners', async () => (
      (await logMessages(controller.logGroup, scaleDownDeployment.startTime, scaleDownDeployment.logStreamName))
        .find((message) => messageMatchesEvent(
          message,
          'scale_set_compute_provider_reconcile_started',
          { desiredRunners: 0 },
        ))
    ));
    const scaleDownMessage = await waitFor('scale-set reconciled with zero runners after scale-down', async () => (
      (await logMessages(controller.logGroup, scaleDownDeployment.startTime, scaleDownDeployment.logStreamName))
        .find((message) => messageMatchesEvent(
          message,
          'scale_set_reconciled',
          { desiredRunners: 0 },
        ))
    ));
    const scaleDown = JSON.parse(scaleDownMessage);
    assert.ok(scaleDown.actions?.terminated > 0, 'EC2 scale-set scale-down did not terminate a runner');
    assert.equal(scaleDown.currentRunners, 0, 'EC2 scale-set scale-down did not return to zero runners');
    for (const { InstanceId } of launchedInstances) {
      await waitFor(`EC2 scale-set runner ${InstanceId} to be terminated`, async () => {
        const response = await aws('ec2', 'describe-instances', '--instance-ids', InstanceId);
        const instance = (response.Reservations ?? [])
          .flatMap((reservation) => reservation.Instances ?? [])
          .find(({ InstanceId: id }) => id === InstanceId);
        return instance?.State?.Name === 'terminated';
      });
    }
    await waitFor('no active EC2 scale-set runners after scale-down', async () => {
      const response = await aws(
        'ec2', 'describe-instances',
        '--filters',
        `Name=tag:ghr:environment,Values=${scaleSetRunnerEnvironment}`,
        'Name=instance-state-name,Values=pending,running',
      );
      const instances = (response.Reservations ?? []).flatMap((reservation) => reservation.Instances ?? []);
      return instances.length === 0 ? instances : false;
    });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
