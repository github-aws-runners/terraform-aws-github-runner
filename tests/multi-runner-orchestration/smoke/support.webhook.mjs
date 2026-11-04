import { createHmac, randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { awsEndpoint, terraformOutput } from './support.aws.mjs';

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
  const jobId = Number(process.env.MINISTACK_SMOKE_JOB_ID ?? Date.now().toString().slice(-8)) + nextJobId++;

  const eventBody = Buffer.from(JSON.stringify(createWorkflowJobEvent(jobId, labels)));
  const signature = createHmac('sha256', secret).update(eventBody).digest('hex');
  const webhookUrl = new URL(endpoint);
  const startTime = Date.now() - 1000;
  const deliveryId = `node-smoke-${randomUUID()}`;
  const response = await postWebhook(
    webhookUrl.host,
    `${webhookUrl.pathname}${webhookUrl.search}`,
    {
      'content-type': 'application/json',
      'x-github-event': 'workflow_job',
      'x-github-delivery': deliveryId,
      'x-github-hook-installation-target-id': '123',
      'x-hub-signature-256': `sha256=${signature}`,
    },
    eventBody,
  );

  if (![200, 201].includes(response.status)) {
    throw new Error(`Webhook failed with HTTP ${response.status}: ${response.body}`);
  }

  return { jobId, deliveryId, startTime };
}

function postWebhook(host, pathname, headers, body) {
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
        let responseBody = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { responseBody += chunk; });
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            body: responseBody,
          });
        });
      },
    );

    request.setTimeout(15000, () => request.destroy(new Error('Timed out sending webhook')));
    request.on('error', reject);
    request.end(body);
  });
}
