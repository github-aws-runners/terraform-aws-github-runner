import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { aws, waitFor } from './support.aws.mjs';

export async function findScaleSetControllerService(
  clusterName = process.env.MINISTACK_SCALE_SET_CLUSTER ?? 'multi-runner-webhook-scale-set',
) {
  const clusters = (await aws('ecs', 'list-clusters')).clusterArns ?? [];
  const clusterArn = clusters.find((arn) => arn.includes(clusterName));
  if (!clusterArn) return undefined;

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

  return undefined;
}

export function prepareTaskDefinition(controller, minimumRunners) {
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
  if (manifest.reconcilers?.length === 1) {
    manifest.reconcilers[0].minRunners = minimumRunners;
  }
  environment.set('SCALE_SET_CONTROLLER_MANIFEST', JSON.stringify(manifest));

  container.environment = [...environment].map(([name, value]) => ({ name, value }));
  return taskDefinition;
}

export async function waitForTaskRevision(controller, taskDefinitionArn, minimumRunners) {
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

export async function deployMinimumRunners(controller, minimumRunners, temporaryDirectory) {
  const taskDefinition = prepareTaskDefinition(controller, minimumRunners);
  const inputFile = path.join(temporaryDirectory, `task-${minimumRunners}.json`);
  await writeFile(inputFile, JSON.stringify(taskDefinition));

  const registration = await aws(
    'ecs', 'register-task-definition',
    '--cli-input-json', `file://${inputFile}`,
  );
  const taskDefinitionArn = registration.taskDefinition?.taskDefinitionArn;
  const startTime = Date.now() - 1000;
  if (!taskDefinitionArn) return { taskDefinitionArn, startTime };

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

  return {
    taskDefinitionArn,
    startTime,
    streamPrefix,
    taskId,
    logStreamName: streamPrefix && taskId
      ? `${streamPrefix}/${controller.container.name}/${taskId}`
      : undefined,
  };
}
