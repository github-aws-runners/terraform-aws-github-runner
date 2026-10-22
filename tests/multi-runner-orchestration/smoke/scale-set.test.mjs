import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  assertCloudWatchEvent,
  aws,
  waitFor,
} from './support.mjs';

const testTimeout = Number(process.env.MINISTACK_SMOKE_TIMEOUT_MS ?? 7200000);

async function findScaleSetControllerService() {
  const clusters = (await aws('ecs', 'list-clusters')).clusterArns ?? [];
  const clusterArn = clusters.find((arn) => arn.includes('multi-runner-webhook-scale-set'));
  assert.ok(clusterArn, 'Scale-set ECS cluster is missing; ensure Compose terraform-apply completed');

  const serviceArns = (await aws('ecs', 'list-services', '--cluster', clusterArn)).serviceArns ?? [];
  for (const serviceArn of serviceArns) {
    const response = await aws(
      'ecs', 'describe-services',
      '--cluster', clusterArn,
      '--services', serviceArn,
    );
    const service = response.services?.[0];
    if (!service?.taskDefinition) continue;

    const taskResponse = await aws('ecs', 'describe-task-definition', '--task-definition', service.taskDefinition);
    const taskDefinition = taskResponse.taskDefinition;
    const container = taskDefinition.containerDefinitions?.find(
      (definition) => definition.name === 'scale-set-controller',
    );

    if (container) {
      return {
        clusterArn,
        service,
        taskDefinition,
        container,
        logGroup: container.logConfiguration?.options?.['awslogs-group'],
      };
    }
  }

  throw new Error('Scale-set controller ECS service/task definition not found');
}

function prepareTaskDefinition(controller, minimumRunners) {
  const taskDefinition = structuredClone(controller.taskDefinition);
  const registeredFields = [
    'taskDefinitionArn',
    'revision',
    'status',
    'requiresAttributes',
    'compatibilities',
    'registeredAt',
    'registeredBy',
  ];

  for (const field of registeredFields) delete taskDefinition[field];

  const container = taskDefinition.containerDefinitions.find(
    (definition) => definition.name === 'scale-set-controller',
  );
  const environment = new Map(
    (container.environment ?? []).map(({ name, value }) => [name, value]),
  );
  environment.set('AWS_ACCESS_KEY_ID', '000000000000');
  environment.set('AWS_SECRET_ACCESS_KEY', 'test-only');

  const manifest = JSON.parse(environment.get('SCALE_SET_CONTROLLER_MANIFEST'));
  assert.equal(manifest.reconcilers?.length, 1, 'Expected one scale-set reconciler');
  manifest.reconcilers[0].minRunners = minimumRunners;
  environment.set('SCALE_SET_CONTROLLER_MANIFEST', JSON.stringify(manifest));

  container.environment = [...environment].map(([name, value]) => ({ name, value }));
  return taskDefinition;
}

async function waitForTaskRevision(controller, taskDefinitionArn, minimumRunners) {
  return waitFor(`controller deployment with minimum ${minimumRunners}`, async () => {
    const response = await aws(
      'ecs', 'list-tasks',
      '--cluster', controller.clusterArn,
      '--service-name', controller.service.serviceName,
    ).catch(() => ({}));
    const taskArns = response.taskArns ?? [];
    if (taskArns.length === 0) return false;

    const taskResponse = await aws(
      'ecs', 'describe-tasks',
      '--cluster', controller.clusterArn,
      '--tasks', ...taskArns,
    ).catch(() => ({}));

    return taskResponse.tasks?.find((task) => (
      task.taskDefinitionArn === taskDefinitionArn && task.lastStatus === 'RUNNING'
    ));
  });
}

async function deployMinimumRunners(controller, minimumRunners, temporaryDirectory) {
  const taskDefinition = prepareTaskDefinition(controller, minimumRunners);
  const inputFile = path.join(temporaryDirectory, `task-${minimumRunners}.json`);
  await writeFile(inputFile, JSON.stringify(taskDefinition));

  const registration = await aws(
    'ecs', 'register-task-definition',
    '--cli-input-json', `file://${inputFile}`,
  );
  const taskDefinitionArn = registration.taskDefinition?.taskDefinitionArn;
  assert.ok(taskDefinitionArn, 'MiniStack did not register the scale-set task revision');
  const startTime = Date.now() - 1000;

  await aws(
    'ecs', 'update-service',
    '--cluster', controller.clusterArn,
    '--service', controller.service.serviceName,
    '--task-definition', taskDefinitionArn,
    '--force-new-deployment',
  );
  const task = await waitForTaskRevision(controller, taskDefinitionArn, minimumRunners);
  const streamPrefix = controller.container.logConfiguration?.options?.['awslogs-stream-prefix'];
  const taskId = task.taskArn?.split('/').at(-1);
  assert.ok(streamPrefix && taskId, 'MiniStack did not report the controller task log stream identity');

  return {
    startTime,
    logStreamName: `${streamPrefix}/${controller.container.name}/${taskId}`,
  };
}

async function assertReconciliation(controller, minimumRunners, deployment) {
  await assertCloudWatchEvent(
    controller.logGroup,
    'scale_set_compute_provider_reconcile_started',
    { desiredRunners: minimumRunners },
    deployment.startTime,
    deployment.logStreamName,
  );

  const message = await assertCloudWatchEvent(
    controller.logGroup,
    'scale_set_reconciled',
    { desiredRunners: minimumRunners },
    deployment.startTime,
    deployment.logStreamName,
  );

  return JSON.parse(message);
}

test('Scale set: baseline at 0, scale up to 1, and scale down to 0 runners', {
  timeout: testTimeout,
}, async () => {
  const controller = await findScaleSetControllerService();
  assert.ok(controller.logGroup, 'Scale-set controller task has no CloudWatch log group');

  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'scale-set-smoke-'));
  const scaleSteps = [
    {
      minimumRunners: 0,
      verify: (event) => assert.equal(
        event.currentRunners,
        0,
        'Scale-set baseline should have no runners',
      ),
    },
    {
      minimumRunners: 1,
      verify: (event) => {
        assert.ok(
          event.actions?.launched > 0,
          'Scale-set scale-up did not launch a runner',
        );
        assert.equal(
          event.currentRunners,
          1,
          'Scale-set scale-up did not reach one runner',
        );
      },
    },
    {
      minimumRunners: 0,
      verify: (event) => {
        assert.ok(
          event.actions?.terminated > 0,
          'Scale-set scale-down did not terminate a runner',
        );
        assert.equal(
          event.currentRunners,
          0,
          'Scale-set scale-down did not return to zero runners',
        );
      },
    },
  ];

  try {
    for (const step of scaleSteps) {
      const deployment = await deployMinimumRunners(
        controller,
        step.minimumRunners,
        temporaryDirectory,
      );
      const reconciliation = await assertReconciliation(
        controller,
        step.minimumRunners,
        deployment,
      );

      step.verify?.(reconciliation);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
