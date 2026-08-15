# GitHub Actions runner scale-set client for TypeScript

This workspace package implements the GitHub Actions runner scale-set protocol with native `fetch`. It is intended for the `terraform-aws-github-runner` control plane and can also be reused by other Node.js scale-set listeners.

The protocol is currently a GitHub Public Preview. This implementation follows the public [`actions/scaleset`](https://github.com/actions/scaleset) Go client at commit [`cb0405b`](https://github.com/actions/scaleset/tree/cb0405b2d874500e75ae34eff8d582ab75956b45).

The upstream copyright and MIT permission notice are retained in [`LICENSE.actions-scaleset`](./LICENSE.actions-scaleset).

## What it provides

- organization, repository, enterprise, GitHub.com, and GHES registration URLs;
- PAT authentication or an asynchronous access-token provider for existing GitHub App authentication;
- runner scale-set CRUD and runner-group lookup;
- just-in-time runner configuration generation;
- runner lookup and removal;
- message-session creation, refresh, long polling, acknowledgement, and job acquisition;
- bounded retries for network failures, HTTP 429, and HTTP 5xx responses.

There is no scale-up or scale-down REST operation. A listener polls the message queue and reports its maximum capacity. GitHub returns `statistics.totalAssignedJobs`; the caller reconciles its compute capacity to that value and terminates ephemeral compute after `JobCompleted` messages.

## Basic usage

```ts
import { GitHubActionsScaleSetClient } from '@aws-github-runner/github-actions-scale-set';

const client = new GitHubActionsScaleSetClient({
  gitHubConfigUrl: 'https://github.com/example',
  accessTokenProvider: async () => installationAccessToken,
  systemInfo: {
    system: 'terraform-aws-github-runner',
    subsystem: 'scale-set-listener',
  },
  retry: {
    maxRetries: 4,
    initialBackoffMs: 1_000,
    maxBackoffMs: 30_000,
    requestTimeoutMs: 5 * 60_000,
  },
});

const scaleSet = await client.createRunnerScaleSet({
  name: 'linux-x64',
  runnerGroupId: 1,
  runnerSetting: { disableUpdate: true },
});

const session = await client.createMessageSessionClient(scaleSet.id!, 'listener-01');

try {
  const message = await session.getMessage(0, 20);
  if (message) {
    const availableIds = message.jobAvailableMessages.map((job) => job.runnerRequestId);
    await session.acquireJobs(availableIds);

    // Reconcile compute from message.statistics.totalAssignedJobs and use
    // client.generateJitRunnerConfig(...) for every runner being created.

    await session.deleteMessage(message.messageId);
  }
} finally {
  await session.close();
}
```

Treat encoded JIT configurations and all access tokens as secrets. A message should be acknowledged only after its compute and completion handling succeeds so it can be redelivered after a failure.

The retry values shown above are the defaults. `Retry-After` is honored for 429/5xx responses, capped by `maxBackoffMs`. Caller cancellation interrupts both an active request and retry backoff. As in the upstream client, only the `/actions/runner-registration` admin bootstrap also retries 401/403 while RemoteAuth propagates. Queue 401 responses are not transport-retried; they trigger the message-session token refresh flow once.
