import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { request as httpRequest } from 'node:http';

const supportDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(supportDirectory, '../../..');
const exampleDirectory = path.join(repositoryRoot, 'examples/multi-runner-orchestration');

export const awsEndpoint = process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566';
export const awsRegion = process.env.AWS_DEFAULT_REGION ?? 'eu-west-1';

const awsEnvironment = {
  ...process.env,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? '000000000000',
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? 'test-only',
  AWS_DEFAULT_REGION: awsRegion,
  AWS_REGION: awsRegion,
  AWS_ENDPOINT_URL: awsEndpoint,
  AWS_EC2_METADATA_DISABLED: 'true',
};

export function run(command, args, { cwd = repositoryRoot, silent = false, check = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: awsEnvironment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];

    child.stdout.on('data', (chunk) => {
      stdout.push(chunk);
      if (!silent) process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr.push(chunk);
      if (!silent) process.stderr.write(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const result = {
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString().trim(),
        stderr: Buffer.concat(stderr).toString().trim(),
      };

      if (code === 0 || !check) {
        resolve(result);
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} failed (${code}): ${result.stderr}`));
    });
  });
}

export async function aws(...args) {
  const result = await run(
    'aws',
    ['--endpoint-url', awsEndpoint, '--region', awsRegion, ...args, '--output', 'json'],
    { silent: true },
  );

  return result.stdout ? JSON.parse(result.stdout) : {};
}

export async function invokeLambda(functionName, payload = {}) {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'runner-smoke-lambda-'));
  const responseFile = path.join(temporaryDirectory, 'response.json');

  try {
    const response = await aws(
      'lambda', 'invoke',
      '--function-name', functionName,
      '--cli-binary-format', 'raw-in-base64-out',
      '--payload', JSON.stringify(payload),
      responseFile,
    );

    if (response.FunctionError) {
      throw new Error(`${functionName} invocation failed: ${response.FunctionError}`);
    }

    return response;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function assertEc2RunnerCount(expectedCount) {
  const environment = process.env.MINISTACK_RUNNER_ENVIRONMENT ?? 'multi-runner-webhook-ec2';
  const description = `${expectedCount} active EC2 runner(s) in ${environment}`;

  await waitFor(description, async () => {
    const response = await aws(
      'ec2', 'describe-instances',
      '--filters',
      `Name=tag:ghr:environment,Values=${environment}`,
      'Name=instance-state-name,Values=pending,running',
    );
    const instances = (response.Reservations ?? []).flatMap((reservation) => reservation.Instances ?? []);
    return instances.length === expectedCount;
  });

}

export async function waitFor(description, predicate, attempts = 90) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await predicate();
    if (result) return result;

    await delay(2000);
  }

  throw new Error(`Timed out waiting for ${description}`);
}

export async function terraformOutput(name) {
  const result = await run(
    'terraform',
    [`-chdir=${exampleDirectory}`, 'output', '-raw', name],
    { silent: true },
  );

  return result.stdout;
}

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

export async function sendWorkflowJob(labels) {
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

  if (![200, 201].includes(response.status)) {
    throw new Error(`Webhook failed with HTTP ${response.status}: ${response.body}`);
  }

  return { jobId, startTime };
}

export function postWebhook(host, pathname, headers, body) {
  return new Promise((resolve, reject) => {
    const endpoint = new URL(awsEndpoint);
    const request = httpRequest(
      {
        hostname: endpoint.hostname,
        port: endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80),
        path: pathname,
        method: 'POST',
        headers: { ...headers, host },
      },
      (response) => {
        const responseBody = [];
        response.setEncoding('utf8');
        response.on('data', (chunk) => responseBody.push(chunk));
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            body: responseBody.join(''),
          });
        });
      },
    );

    request.setTimeout(15000, () => request.destroy(new Error('Timed out sending webhook')));
    request.on('error', reject);
    request.end(body);
  });
}

export async function logMessages(logGroup, startTime, logStreamName) {
  const args = [
    '--endpoint-url', awsEndpoint,
    '--region', awsRegion,
    'logs', 'filter-log-events',
    '--log-group-name', logGroup,
    '--start-time', String(startTime),
    '--limit', '100',
    '--output', 'json',
  ];
  if (logStreamName) args.push('--log-stream-names', logStreamName);

  const result = await run(
    'aws',
    args,
    { silent: true, check: false },
  );

  if (result.code !== 0) return [];

  try {
    const response = JSON.parse(result.stdout);
    return response.events?.map((event) => event.message) ?? [];
  } catch {
    return [];
  }
}

export async function assertCloudWatchLogContains(logGroup, description, text, startTime) {
  let recentMessages = [];
  try {
    await waitFor(description, async () => {
      recentMessages = await logMessages(logGroup, startTime);
      return recentMessages.find((message) => message.includes(String(text)));
    });
  } catch (error) {
    const logContext = recentMessages.length
      ? recentMessages.slice(-10).join('\n')
      : `No CloudWatch messages found in ${logGroup} after ${new Date(startTime).toISOString()}`;
    throw new Error(`${error.message}\nRecent CloudWatch messages:\n${logContext}`, { cause: error });
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

export async function assertCloudWatchEvent(
  logGroup,
  eventName,
  expectedFields,
  startTime = Date.now() - 60_000,
  logStreamName,
) {
  const description = `CloudWatch ${eventName} (${JSON.stringify(expectedFields)}) in ${logGroup}`;
  let recentMessages = [];
  try {
    return await waitFor(description, async () => {
      recentMessages = await logMessages(logGroup, startTime, logStreamName);
      return recentMessages.find((entry) => eventMatches(entry, eventName, expectedFields));
    });
  } catch (error) {
    const logContext = recentMessages.length
      ? recentMessages.slice(-10).join('\n')
      : `No CloudWatch messages found in ${logGroup} after ${new Date(startTime).toISOString()}`;
    throw new Error(`${error.message}\nRecent CloudWatch messages:\n${logContext}`, { cause: error });
  }
}
