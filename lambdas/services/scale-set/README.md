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
  "scaleSetName": "linux-x64",
  "runnerGroupName": "self-hosted-linux",
  "runnerGroupIdParameterName": "/runners/github-app/runner-group/self-hosted-linux",
  "minRunners": 0,
  "maxRunners": 20,
  "bootTimeoutMinutes": 10,
  "sslVerify": true,
  "githubApp": {
    "appIdParameterName": "/runners/github-app/id",
    "privateKeyParameterName": "/runners/github-app/key"
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

`scaleSetName` and `runnerGroupName` are the GitHub names supplied by the operator. `runnerGroupIdParameterName` is an optional SSM cache path. When present, the service reads the runner-group ID from that parameter; if it is missing, the service resolves the name through the configured GitHub Actions service endpoint and writes the ID back as a non-secret `String` parameter with overwrite enabled. The service resolves the scale-set ID from the group and scale-set names; if the named scale set does not exist, it registers it in the resolved runner group and uses the ID returned by GitHub. `scaleSetId` is only an optional legacy pin for an already-known ID. `expectedRunnerGroupId` can be omitted or null; when supplied, it is treated as an additional consistency check. Optional fields are `scaleSetId`, `runnerGroupIdParameterName`, `expectedRunnerGroupId`, `sessionOwner`, `workFolder`, `forceGhes`, `sslVerify`, and `userAgent`. `sslVerify` defaults to `true`; when false, the service uses a reconciler-scoped Undici dispatcher for both GitHub App token and scale-set requests without changing `NODE_TLS_REJECT_UNAUTHORIZED` or the global dispatcher. `userAgent` becomes the `system` identity inside the required structured scale-set protocol User-Agent rather than replacing that header. `bootTimeoutMinutes` defaults to `10`; it is orchestration-owned and is passed to the selected compute provider on every reconciliation.

GitHub App ID and private-key values are reloaded from SSM whenever an installation token is requested, so key rotation does not require a task restart. `installationIdParameterName` is optional; when it is absent or its parameter is not present, the service creates a short-lived App JWT and discovers the installation by matching the configured organization or enterprise account through `GET /app/installations`. This works with GitHub.com, GHES, and GitHub Enterprise Cloud data-residency API hosts derived from `githubConfigUrl`. A SHA-256 credential fingerprint keeps the same Octokit auth instance—and its token cache—while the values remain unchanged, and replaces it after rotation. Private keys, installation tokens, App JWTs, message-session tokens, message bodies, and JIT configurations are never accepted as manifest values and are redacted from logs.

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
| `LOG_LEVEL`                                   | `info`  |

## Reconciliation and health

Demand is calculated as `max(totalAssignedJobs, min(maxRunners, minRunners + totalAssignedJobs))`. The maximum therefore bounds requested idle capacity without ever requesting scale-down below work GitHub has already assigned. Job-started and job-completed messages maintain a bounded in-memory lifecycle cache. After a restart, lifecycle state is unknown, but provider-owned EC2 tags still identify current capacity. The aggregate scale-set busy count protects unknown runners from scale-down until it reaches zero. Runner deletion executes inside the serialized reconcile loop and re-checks the exact Actions-service runner identity by name before removal.

The public GitHub runner inventory is not fetched by the scale-set service. The selected compute provider reconciles its own capacity inventory, while the scale-set session remains the source of demand and aggregate busy-runner statistics. This keeps the service aligned with the upstream scale-set API and supports GitHub.com, GHES, and data-residency endpoints without relying on a separate public REST runner endpoint.

Messages follow the upstream scale-set listener order: acknowledge first, then acquire available jobs, update lifecycle state, and reconcile compute. Provider failures therefore stop that reconciler after the message has been acknowledged; provider results expose one error outcome rather than the control-plane scaling retry classification. A typed busy/unknown retention remains a successful reconciliation. Session and transport failures are handled separately by bounded client retries or session recreation.

The EC2 provider uses the tagged, `config-published` EC2 instances as its capacity inventory. The GitHub Actions scale-set session supplies `desiredRunners` through `totalAssignedJobs` and the aggregate `totalBusyRunners` count. When capacity is above desired and the aggregate busy count is zero, tagged runners may be removed through the Actions service and their matching EC2 instances terminated; busy, contradictory, or unknown identities are retained. The provider uses the boot window (`bootTimeoutMinutes`, default `10`) for newly launched instances and keeps interrupted publication states from being counted as serving. EC2 ownership includes a SHA-256 hash of the canonical GitHub configuration scope, preventing the same runner-config name and numeric scale-set ID in another GitHub scope from colliding. No public GitHub REST runner inventory call is required.

- `GET /healthz` reports controller liveness and is used by Docker/ECS. External GitHub outages remain live but degraded to avoid restart loops.
- `GET /readyz` reports readiness and returns 503 unless every reconciler is ready.

## Container

Build from the repository root:

```shell
docker build --target runtime -f lambdas/services/scale-set/Dockerfile -t scale-set-controller .
```

The image supports `linux/amd64` and `linux/arm64`, uses a digest-pinned multi-stage Node image, runs as the unprivileged `node` user, includes a Node-based health check, and does not require filesystem writes. Deploy with a read-only root filesystem, all Linux capabilities dropped, no Docker socket, and only the task-role permissions required by the selected group.

The module's official GHCR package must allow anonymous pulls so the default image works without registry credentials. Production deployments should select a released image by digest and verify its provenance/attestation. A private ECR override requires `container.ecr_repository.arn`; private non-ECR registry credentials are not currently exposed by the Terraform orchestration module.
