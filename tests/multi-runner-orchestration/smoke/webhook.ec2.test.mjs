import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aws, logMessages, waitFor } from './support.aws.mjs';
import { sendWorkflowJob } from './support.webhook.mjs';

const testTimeout = Number(process.env.MINISTACK_SMOKE_TIMEOUT_MS ?? 7200000);
const scaleDownFunction = 'multi-runner-webhook-ec2-scale-down';
const scaleDownLogGroup = '/aws/lambda/multi-runner-webhook-ec2-scale-down';
const configuredInstanceTypes = ['m7a.large', 'm5.large'];
const runnerEnvironment = process.env.MINISTACK_RUNNER_ENVIRONMENT ?? 'multi-runner-webhook-ec2';
const githubApiAdminUrl = new URL(process.env.MINISTACK_GITHUB_API_ADMIN_URL ?? 'http://localhost:8080');

async function readGithubApiJournal() {
  const response = await fetch(new URL('/__admin/requests', githubApiAdminUrl), {
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`WireMock request journal returned HTTP ${response.status}: ${body}`);
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`WireMock request journal returned invalid JSON: ${body}`, { cause: error });
  }
}

function eventMatches(message, eventName, expectedFields) {
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

async function scaleDown(description, startTime, instances) {
  // MiniStack does not boot the EC2 runner agent to register it with GitHub.
  // The first scheduled cleanup marks it orphaned; the next confirms GitHub
  // has no such runner and terminates the EC2 instance.
  const firstScaleDownInvocation = await aws(
    'lambda', 'invoke',
    '--function-name', scaleDownFunction,
    '--cli-binary-format', 'raw-in-base64-out',
    '--payload', '{}',
    '/dev/null',
  );
  assert.equal(firstScaleDownInvocation.FunctionError, undefined, 'First scale-down Lambda invocation failed');

  for (const { InstanceId } of instances) {
    await waitFor(
      `${description} runner instance ${InstanceId} was marked orphaned`,
      async () => {
        const messages = await logMessages(scaleDownLogGroup, startTime);
        return messages.find((message) => message.includes(`Runner '${InstanceId}' tagged as orphan.`));
      },
    );
    await waitFor(`EC2 instance ${InstanceId} to be marked orphaned`, async () => {
      const response = await aws('ec2', 'describe-instances', '--instance-ids', InstanceId);
      const instance = (response.Reservations ?? [])
        .flatMap((reservation) => reservation.Instances ?? [])
        .find(({ InstanceId: id }) => id === InstanceId);
      return instance?.Tags?.some(({ Key, Value }) => Key === 'ghr:orphan' && Value === 'true');
    });
  }

  const secondScaleDownInvocation = await aws(
    'lambda', 'invoke',
    '--function-name', scaleDownFunction,
    '--cli-binary-format', 'raw-in-base64-out',
    '--payload', '{}',
    '/dev/null',
  );
  assert.equal(secondScaleDownInvocation.FunctionError, undefined, 'Second scale-down Lambda invocation failed');

  for (const { InstanceId } of instances) {
    await waitFor(
      `${description} runner instance ${InstanceId} was terminated`,
      async () => {
        const messages = await logMessages(scaleDownLogGroup, startTime);
        return messages.find((message) => message.includes(`Runner ${InstanceId} has been terminated.`));
      },
    );
    await waitFor(`EC2 instance ${InstanceId} to reach terminated state`, async () => {
      const response = await aws('ec2', 'describe-instances', '--instance-ids', InstanceId);
      const instance = (response.Reservations ?? [])
        .flatMap((reservation) => reservation.Instances ?? [])
        .find(({ InstanceId: id }) => id === InstanceId);
      return instance?.State?.Name === 'terminated';
    });
  }

  await waitFor(`no active EC2 runners in ${runnerEnvironment}`, async () => {
    const response = await aws(
      'ec2', 'describe-instances',
      '--filters',
      `Name=tag:ghr:environment,Values=${runnerEnvironment}`,
      'Name=instance-state-name,Values=pending,running',
    );
    const activeInstances = (response.Reservations ?? [])
      .flatMap((reservation) => reservation.Instances ?? []);
    return activeInstances.length === 0 ? activeInstances : false;
  });
}

test('EC2 Webhook: standard labels create and terminate a runner', {
  timeout: testTimeout,
}, async () => {
  const runnerGroupParameter =
    '/github-action-runners/multi-runner-webhook/ec2/runners/config/runner-group/smoke-test-group';
  try {
    await aws(
      'ssm', 'delete-parameter',
      '--name', runnerGroupParameter,
    );
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('(ParameterNotFound)')) throw error;
  }
  const runnerGroupRequests = ((await readGithubApiJournal()).requests ?? []).filter(({ request, wasMatched }) => (
    request
    && (wasMatched === undefined || wasMatched)
    && request.method === 'GET'
    && new URL(request.url, githubApiAdminUrl).pathname.endsWith('/actions/runner-groups')
  )).length;
  await waitFor(`no active EC2 runners in ${runnerEnvironment}`, async () => {
    const response = await aws(
      'ec2', 'describe-instances',
      '--filters',
      `Name=tag:ghr:environment,Values=${runnerEnvironment}`,
      'Name=instance-state-name,Values=pending,running',
    );
    const instances = (response.Reservations ?? []).flatMap((reservation) => reservation.Instances ?? []);
    return instances.length === 0 ? instances : false;
  });
  const { jobId, deliveryId, startTime } = await sendWorkflowJob(['self-hosted', 'linux', 'x64', 'ec2']);
  await waitFor(`webhook delivery ${deliveryId} accepted for job ${jobId}`,
    async () => {
      const messages = await logMessages('/aws/lambda/multi-runner-webhook-webhook', startTime);
      return messages.find((message) => message.includes(deliveryId));
    },
  );
  await waitFor(
    `webhook delivery ${deliveryId} parsed workflow job ${jobId}`,
    async () => {
      const messages = await logMessages('/aws/lambda/multi-runner-webhook-webhook', startTime);
      return messages.find((message) => message.includes(`\"workflowJobId\":${jobId}`));
    },
  );
  await waitFor(
    `webhook delivery ${deliveryId} dispatched job ${jobId} to a runner queue`,
    async () => {
      const messages = await logMessages('/aws/lambda/multi-runner-webhook-dispatch-to-runner', startTime);
      return messages.find((message) => message.includes('Successfully dispatched job for test-owner/test-repo to the queue(s)'));
    },
  );
  await waitFor(
    `webhook delivery ${deliveryId} matched job ${jobId}`,
    async () => {
      const messages = await logMessages('/aws/lambda/multi-runner-webhook-dispatch-to-runner', startTime);
      return messages.find((message) => message.includes(`Job ID: ${jobId}`));
    },
  );
  await waitFor(
    'scale-up resolved the runner group after an SSM cache miss',
    async () => {
      const messages = await logMessages('/aws/lambda/multi-runner-webhook-ec2-scale-up', startTime);
      return messages.find((message) => message.includes('Runner group cache miss; caller will resolve the ID from GitHub'));
    },
  );
  let observedRunnerGroupRequests = runnerGroupRequests;
  try {
    await waitFor('scale-up to fetch runner groups from GitHub after an SSM cache miss', async () => {
      observedRunnerGroupRequests = ((await readGithubApiJournal()).requests ?? []).filter(({ request, wasMatched }) => (
        request
        && (wasMatched === undefined || wasMatched)
        && request.method === 'GET'
        && new URL(request.url, githubApiAdminUrl).pathname.endsWith('/actions/runner-groups')
      )).length;
      return observedRunnerGroupRequests > runnerGroupRequests;
    });
  } catch (error) {
    throw new Error(
      `${error.message}; expected more than ${runnerGroupRequests} requests, observed ${observedRunnerGroupRequests}`,
      { cause: error },
    );
  }
  await waitFor(
    'scale-up stored the GitHub runner group ID in SSM',
    async () => {
      const messages = await logMessages('/aws/lambda/multi-runner-webhook-ec2-scale-up', startTime);
      return messages.find((message) => eventMatches(message, 'Stored runner group ID in cache', { runnerGroupName: 'smoke-test-group', runnerGroupId: 1 }));
    },
  );
  await waitFor(`scale-up attempted runner launch for standard-label job ${jobId}`,
    async () => {
      const messages = await logMessages('/aws/lambda/multi-runner-webhook-ec2-scale-up', startTime);
      return messages.find((message) => message.includes('Runner creation summary.'));
    },
  );
  await waitFor(
    'scale-up logged runner creation summary with one successful runner',
    async () => {
      const messages = await logMessages('/aws/lambda/multi-runner-webhook-ec2-scale-up', startTime);
      return messages.find((message) => eventMatches(message, 'Runner creation summary.', { successfulRunnerCount: 1 }));
    },
  );
  const instances = await waitFor(`one active EC2 runner in ${runnerEnvironment}`, async () => {
    const response = await aws(
      'ec2', 'describe-instances',
      '--filters',
      `Name=tag:ghr:environment,Values=${runnerEnvironment}`,
      'Name=instance-state-name,Values=pending,running',
    );
    const instances = (response.Reservations ?? []).flatMap((reservation) => reservation.Instances ?? []);
    return instances.length === 1 ? instances : false;
  });
  assert.equal(instances.length, 1, `standard-label job ${jobId}: expected one EC2 instance, found ${instances.length}`);
  assert.ok(
    configuredInstanceTypes.includes(instances[0].InstanceType),
    `standard-label job ${jobId}: EC2 instance ${instances[0].InstanceId} has type ${instances[0].InstanceType}; expected ${configuredInstanceTypes.join(' or ')}`,
  );
  const scaleDownStartTime = Date.now() - 1000;
  await scaleDown(`standard-label job ${jobId}`, scaleDownStartTime, instances);
});

test('EC2 Webhook: dynamic labels apply m5.large and terminate the runner', {
  timeout: testTimeout,
}, async () => {
  await waitFor(`no active EC2 runners in ${runnerEnvironment}`, async () => {
    const response = await aws(
      'ec2', 'describe-instances',
      '--filters',
      `Name=tag:ghr:environment,Values=${runnerEnvironment}`,
      'Name=instance-state-name,Values=pending,running',
    );
    const instances = (response.Reservations ?? []).flatMap((reservation) => reservation.Instances ?? []);
    return instances.length === 0 ? instances : false;
  });
  const runnerGroupRequests = ((await readGithubApiJournal()).requests ?? []).filter(({ request, wasMatched }) => (
    request
    && (wasMatched === undefined || wasMatched)
    && request.method === 'GET'
    && new URL(request.url, githubApiAdminUrl).pathname.endsWith('/actions/runner-groups')
  )).length;
  const jitConfigRequests = ((await readGithubApiJournal()).requests ?? []).filter(({ request, wasMatched }) => (
    request
    && (wasMatched === undefined || wasMatched)
    && request.method === 'POST'
    && new URL(request.url, githubApiAdminUrl).pathname.endsWith('/actions/runners/generate-jitconfig')
  )).length;
  const dynamicLabel = 'ghr-ec2-instance-type:m5.large';
  const { jobId, deliveryId, startTime } = await sendWorkflowJob([
    'self-hosted', 'linux', 'x64', 'ec2', dynamicLabel,
  ]);
  await waitFor(`webhook delivery ${deliveryId} accepted for job ${jobId}`,
    async () => {
      const messages = await logMessages('/aws/lambda/multi-runner-webhook-webhook', startTime);
      return messages.find((message) => message.includes(deliveryId));
    },
  );
  await waitFor(
    `webhook delivery ${deliveryId} parsed workflow job ${jobId}`,
    async () => {
      const messages = await logMessages('/aws/lambda/multi-runner-webhook-webhook', startTime);
      return messages.find((message) => message.includes(`\"workflowJobId\":${jobId}`));
    },
  );
  await waitFor(
    `webhook delivery ${deliveryId} dispatched job ${jobId} to a runner queue`,
    async () => {
      const messages = await logMessages('/aws/lambda/multi-runner-webhook-dispatch-to-runner', startTime);
      return messages.find((message) => message.includes('Successfully dispatched job for test-owner/test-repo to the queue(s)'));
    },
  );
  await waitFor(
    `webhook delivery ${deliveryId} matched job ${jobId}`,
    async () => {
      const messages = await logMessages('/aws/lambda/multi-runner-webhook-dispatch-to-runner', startTime);
      return messages.find((message) => message.includes(`Job ID: ${jobId}`));
    },
  );
  await waitFor(
    'scale-up found the cached runner group ID',
    async () => {
      const messages = await logMessages('/aws/lambda/multi-runner-webhook-ec2-scale-up', startTime);
      return messages.find((message) => eventMatches(message, 'Runner group cache hit', { runnerGroupName: 'smoke-test-group', runnerGroupId: 1 }));
    },
  );
  assert.equal(
    ((await readGithubApiJournal()).requests ?? []).filter(({ request, wasMatched }) => (
      request
      && (wasMatched === undefined || wasMatched)
      && request.method === 'GET'
      && new URL(request.url, githubApiAdminUrl).pathname.endsWith('/actions/runner-groups')
    )).length,
    runnerGroupRequests,
    'scale-up should reuse the cached runner group ID without listing groups again',
  );
  await waitFor(`scale-up applied dynamic label ${dynamicLabel} for job ${jobId}`,
    async () => {
      const messages = await logMessages('/aws/lambda/multi-runner-webhook-ec2-scale-up', startTime);
      return messages.find((message) => message.includes('"ec2OverrideConfig":{"InstanceType":"m5.large"}'));
    },
  );
  let observedJitConfigRequests = jitConfigRequests;
  try {
    await waitFor(`scale-up to request GitHub JIT configuration for dynamic-label job ${jobId}`, async () => {
      observedJitConfigRequests = ((await readGithubApiJournal()).requests ?? []).filter(({ request, wasMatched }) => (
        request
        && (wasMatched === undefined || wasMatched)
        && request.method === 'POST'
        && new URL(request.url, githubApiAdminUrl).pathname.endsWith('/actions/runners/generate-jitconfig')
      )).length;
      return observedJitConfigRequests > jitConfigRequests;
    });
  } catch (error) {
    throw new Error(
      `${error.message}; expected more than ${jitConfigRequests} requests, observed ${observedJitConfigRequests}`,
      { cause: error },
    );
  }
  await waitFor(
    'scale-up logged runner creation summary with one successful runner',
    async () => {
      const messages = await logMessages('/aws/lambda/multi-runner-webhook-ec2-scale-up', startTime);
      return messages.find((message) => eventMatches(message, 'Runner creation summary.', { successfulRunnerCount: 1 }));
    },
  );
  const instances = await waitFor(`one active EC2 runner in ${runnerEnvironment}`, async () => {
    const response = await aws(
      'ec2', 'describe-instances',
      '--filters',
      `Name=tag:ghr:environment,Values=${runnerEnvironment}`,
      'Name=instance-state-name,Values=pending,running',
    );
    const instances = (response.Reservations ?? []).flatMap((reservation) => reservation.Instances ?? []);
    return instances.length === 1 ? instances : false;
  });
  assert.equal(instances.length, 1, `dynamic-label job ${jobId}: expected one EC2 instance, found ${instances.length}`);
  assert.ok(
    ['m5.large'].includes(instances[0].InstanceType),
    `dynamic-label job ${jobId}: EC2 instance ${instances[0].InstanceId} has type ${instances[0].InstanceType}; expected ${['m5.large'].join(' or ')}`,
  );
  const scaleDownStartTime = Date.now() - 1000;
  await scaleDown(`dynamic-label job ${jobId}`, scaleDownStartTime, instances);
});

test('EC2 Pool: create and terminate one runner', {
  timeout: testTimeout,
}, async () => {
  await waitFor(`no active EC2 runners in ${runnerEnvironment}`, async () => {
    const response = await aws(
      'ec2', 'describe-instances',
      '--filters',
      `Name=tag:ghr:environment,Values=${runnerEnvironment}`,
      'Name=instance-state-name,Values=pending,running',
    );
    const instances = (response.Reservations ?? []).flatMap((reservation) => reservation.Instances ?? []);
    return instances.length === 0 ? instances : false;
  });
  const startTime = Date.now() - 1000;
  const invocation = await aws(
    'lambda', 'invoke',
    '--function-name', 'multi-runner-webhook-ec2-pool',
    '--cli-binary-format', 'raw-in-base64-out',
    '--payload', JSON.stringify({ poolSize: 1, type: 'ec2' }),
    '/dev/null',
  );
  assert.equal(invocation.FunctionError, undefined, 'Pool Lambda invocation failed');
  await waitFor('pool handler requested one runner',
    async () => {
      const messages = await logMessages('/aws/lambda/multi-runner-webhook-ec2-pool', startTime);
      return messages.find((message) => message.includes('The pool will be topped up with 1 runners.'));
    },
  );
  const instances = await waitFor(`one active EC2 runner in ${runnerEnvironment}`, async () => {
    const response = await aws(
      'ec2', 'describe-instances',
      '--filters',
      `Name=tag:ghr:environment,Values=${runnerEnvironment}`,
      'Name=instance-state-name,Values=pending,running',
    );
    const instances = (response.Reservations ?? []).flatMap((reservation) => reservation.Instances ?? []);
    return instances.length === 1 ? instances : false;
  });
  assert.equal(instances.length, 1, `pool: expected one EC2 instance, found ${instances.length}`);
  assert.ok(
    configuredInstanceTypes.includes(instances[0].InstanceType),
    `pool: EC2 instance ${instances[0].InstanceId} has type ${instances[0].InstanceType}; expected ${configuredInstanceTypes.join(' or ')}`,
  );

  const scaleDownStartTime = Date.now() - 1000;
  await scaleDown('pool', scaleDownStartTime, instances);
});
