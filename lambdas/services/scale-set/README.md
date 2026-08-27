# Scale-set controller service

This workspace builds the long-running, topology-neutral controller used by the scale-set orchestration provider.

Each controller group maps to one ECS service, one task definition, and normally one running task. The task contains one application container and one `ScaleSetController`, which supervises one independent reconciler per runner config:

```text
ECS service (controller group)
└── one ECS task
    └── one scale-set container
        └── ScaleSetController
            ├── reconciler: runner config A → scale set A → session A
            └── reconciler: runner config B → scale set B → session B
```

A group is only a packing and deployment boundary. Every reconciler retains its own GitHub message session, lifecycle state, retry loop, health, and compute-provider instance. One reconciler failure does not exit the others.

## Production configuration

The ECS task receives only these group selectors:

- `SCALE_SET_CONTROLLER_GROUP_NAME`
- `SCALE_SET_CONTROLLER_GROUP_CONFIG_PATH`
- `SCALE_SET_CONTROLLER_GROUP_CONFIG_REVISION`

The service reads every direct child under the SSM path with paginated `GetParametersByPath`. Each child name must equal its `runnerConfigName`, and each value uses this flat, versioned schema:

```json
{
  "schemaVersion": 1,
  "runnerConfigName": "linux-x64",
  "githubConfigUrl": "https://github.com/example",
  "scaleSetId": 123,
  "expectedScaleSetName": "linux-x64",
  "expectedRunnerGroupId": null,
  "minRunners": 0,
  "maxRunners": 20,
  "bootTimeoutMinutes": 10,
  "sslVerify": true,
  "githubApp": {
    "appIdParameterName": "/runners/github-app/id",
    "privateKeyParameterName": "/runners/github-app/key",
    "installationIdParameterName": "/runners/github-app/installation-id"
  },
  "computeProvider": {
    "type": "ec2",
    "configuration": {
      "region": "eu-west-1",
      "environment": "example-linux-x64",
      "runnerNamePrefix": "",
      "jitConfigParameterPath": "/runners/example-linux-x64/tokens",
      "subnets": ["subnet-0123456789abcdef0"],
      "launchTemplateName": "example-linux-x64-action-runner",
      "ec2instanceCriteria": {
        "instanceTypes": ["m7i.large"],
        "targetCapacityType": "spot",
        "instanceAllocationStrategy": "price-capacity-optimized"
      },
      "onDemandFailoverOnError": [],
      "useDedicatedHost": false,
      "ssmParameterTags": []
    }
  }
}
```

Optional fields are `sessionOwner`, `workFolder`, `forceGhes`, `sslVerify`, and `userAgent`. `sslVerify` defaults to `true`; when false, the service uses a reconciler-scoped Undici dispatcher for both GitHub App token and scale-set requests without changing `NODE_TLS_REJECT_UNAUTHORIZED` or the global dispatcher. `userAgent` becomes the `system` identity inside the required structured scale-set protocol User-Agent rather than replacing that header. `bootTimeoutMinutes` defaults to `10`; it is orchestration-owned and is passed to the selected compute provider on every reconciliation. `expectedRunnerGroupId` can be omitted or null. Before opening a session, the reconciler fetches the configured scale-set ID and verifies its expected name and, when supplied, runner-group ID.

GitHub App values are reloaded from SSM whenever an installation token is requested, so key rotation does not require a task restart. A SHA-256 credential fingerprint keeps the same Octokit auth instance—and its token cache—while the values remain unchanged, and replaces it after rotation. Private keys, installation tokens, message-session tokens, message bodies, and JIT configurations are never accepted as manifest values and are redacted from logs.

`SCALE_SET_CONTROLLER_MANIFEST` is supported only as a bounded local/test convenience. It contains `{ "version": 1, "groupName": "...", "reconcilers": [...] }` and uses the same reconciler objects.

Runtime settings:

| Environment variable                          | Default |
| --------------------------------------------- | ------- |
| `SCALE_SET_HEALTH_PORT`                       | `8080`  |
| `SCALE_SET_HEALTH_STALE_AFTER_SECONDS`        | `180`   |
| `SCALE_SET_SHUTDOWN_TIMEOUT_SECONDS`          | `110`   |
| `SCALE_SET_SESSION_CLOSE_TIMEOUT_SECONDS`     | `10`    |
| `SCALE_SET_RECONNECT_INITIAL_BACKOFF_SECONDS` | `1`     |
| `SCALE_SET_RECONNECT_MAX_BACKOFF_SECONDS`     | `30`    |

## Reconciliation and health

Demand is calculated as `max(totalAssignedJobs, min(maxRunners, minRunners + totalAssignedJobs))`. The maximum therefore bounds requested idle capacity without ever requesting scale-down below work GitHub has already assigned. Job-started and job-completed messages maintain a bounded in-memory lifecycle cache. State is unknown after restart unless GitHub provides an exact runner match, and the compute provider must retain unknown or busy runners.

The public GitHub runner inventory is not fetched on ordinary steady-state or scale-up polls. A compute provider explicitly requests one bounded, owner-scope inventory refresh when it needs to verify old handed-off capacity or perform safe scale-down; owner inventory is briefly shared across reconcilers. The first provider pass is marked lifecycle-only and the second is explicitly marked inventory-complete, so the provider cannot mistake a post-restart gap for an authoritative absence. Runner deletion executes inside the serialized reconcile loop, re-fetches the Actions identity by name, and then performs a fresh public GitHub lookup to verify the exact ID/name and confirm the runner is not busy before issuing the delete.

Messages follow the upstream scale-set listener order: acknowledge first, then acquire available jobs, update lifecycle state, and reconcile compute. Provider failures therefore stop that reconciler after the message has been acknowledged; provider results expose one error outcome rather than the control-plane scaling retry classification. A typed busy/unknown retention remains a successful reconciliation. Session and transport failures are handled separately by bounded client retries or session recreation.

The EC2 provider counts a `config-published` instance as serving only during the orchestration request's boot window (`bootTimeoutMinutes`, default `10`) or after an exact online or `JobStarted` identity is observed. After the window, offline or unknown capacity is retained rather than terminated, and the complete inventory pass allows it to stop suppressing a replacement. Instances left in an earlier or unknown publication state are also retained for operator recovery and never terminated speculatively. EC2 ownership includes a SHA-256 hash of the canonical GitHub configuration scope, preventing the same runner-config name and numeric scale-set ID in another GitHub scope from colliding. A bounded one-instance physical surge may replace ambiguous capacity; once that ceiling is reached, the provider reports retained capacity instead of creating an unbounded replacement loop.

- `GET /healthz` reports controller liveness and is used by Docker/ECS. External GitHub outages remain live but degraded to avoid restart loops.
- `GET /readyz` reports readiness and returns 503 unless every reconciler is ready.

## Container

Build from the repository root:

```shell
docker build --target runtime -f lambdas/services/scale-set/Dockerfile -t scale-set-controller .
```

The image supports `linux/amd64` and `linux/arm64`, uses a digest-pinned multi-stage Node image, runs as the unprivileged `node` user, includes a Node-based health check, and does not require filesystem writes. Deploy with a read-only root filesystem, all Linux capabilities dropped, no Docker socket, and only the task-role permissions required by the selected group.

The module's official GHCR package must allow anonymous pulls so the default image works without registry credentials. Production deployments should select a released image by digest and verify its provenance/attestation. A private ECR override requires `container.ecr_repository.arn`; private non-ECR registry credentials are not currently exposed by the Terraform orchestration module.
