import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { aws } from './support.mjs';

const cluster = process.env.MINISTACK_SCALE_SET_CLUSTER
  ?? 'multi-runner-webhook-scale-set';
const serviceArns = (await aws('ecs', 'list-services', '--cluster', cluster)).serviceArns ?? [];
assert.ok(serviceArns.length > 0, `No ECS service found in cluster ${cluster}`);

const serviceResponse = await aws(
  'ecs', 'describe-services',
  '--cluster', cluster,
  '--services', serviceArns[0],
);
const service = serviceResponse.services?.[0];
assert.ok(service?.taskDefinition, `No task definition found for service ${serviceArns[0]}`);

const taskDefinitionResponse = await aws(
  'ecs', 'describe-task-definition',
  '--task-definition', service.taskDefinition,
);
const taskDefinition = taskDefinitionResponse.taskDefinition;
assert.ok(taskDefinition, `Could not describe task definition ${service.taskDefinition}`);

for (const field of [
  'taskDefinitionArn',
  'revision',
  'status',
  'requiresAttributes',
  'compatibilities',
  'registeredAt',
  'registeredBy',
]) {
  delete taskDefinition[field];
}

const controller = taskDefinition.containerDefinitions?.find(
  (definition) => definition.name === 'scale-set-controller',
);
assert.ok(controller, 'Task definition has no scale-set-controller container');

const environment = new Map(
  (controller.environment ?? [])
    .filter(({ name }) => name !== 'AWS_ACCESS_KEY_ID' && name !== 'AWS_SECRET_ACCESS_KEY')
    .map(({ name, value }) => [name, value]),
);
environment.set('AWS_ACCESS_KEY_ID', '000000000000');
environment.set('AWS_SECRET_ACCESS_KEY', 'test-only');
controller.environment = [...environment].map(([name, value]) => ({ name, value }));

const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'scale-set-credentials-'));
try {
  const inputFile = path.join(temporaryDirectory, 'task-definition.json');
  await writeFile(inputFile, JSON.stringify(taskDefinition));

  const registration = await aws(
    'ecs', 'register-task-definition',
    '--cli-input-json', `file://${inputFile}`,
  );
  const taskDefinitionArn = registration.taskDefinition?.taskDefinitionArn;
  assert.ok(taskDefinitionArn, 'MiniStack did not register the credential-enabled task definition');

  await aws(
    'ecs', 'update-service',
    '--cluster', cluster,
    '--service', service.serviceName,
    '--task-definition', taskDefinitionArn,
    '--force-new-deployment',
  );

} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
