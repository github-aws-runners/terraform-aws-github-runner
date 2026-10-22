import { spawn } from 'node:child_process';
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
  await waitFor(description, async () => {
    const messages = await logMessages(logGroup, startTime);
    return messages.find((message) => message.includes(String(text)));
  });

}

function eventMatches(message, eventName, expectedFields) {
  try {
    const event = JSON.parse(message);
    return event.event === eventName
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
  const message = await waitFor(description, async () => {
    const messages = await logMessages(logGroup, startTime, logStreamName);
    return messages.find((entry) => eventMatches(entry, eventName, expectedFields));
  });

  return message;
}
