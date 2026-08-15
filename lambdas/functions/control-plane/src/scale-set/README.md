# Scale-set control-plane orchestration

This directory contains the provider-neutral reconciliation layer and an executable ECS listener for GitHub Actions runner scale sets. It does not create the GitHub-side scale set.

The scale set is a demand protocol, not a compute-provider type. A host combines:

1. `GitHubActionsScaleSetClient` and one owned message session;
2. the selected compute provider's `scaleSet()` capability;
3. `pollScaleSetOnce()` or `runScaleSetPollLoop()`;
4. a configured GitHub scale-set ID and ephemeral/JIT-enabled runner image.

`pollScaleSetOnce()` scales to `min(maxRunners, minRunners + totalAssignedJobs)`, acquires available jobs, terminates exact `JobCompleted` runner names, and acknowledges the message only after reconciliation succeeds.

EC2 runners use a fail-closed bootstrap fence: launch tags start at `provisioning`, the control plane persists `publishing` before the ambiguous SSM write, publishes `config-published` only after that write succeeds, and the runner changes its own state to `ready` only after it has consumed and deleted that configuration. A returned JIT process records `stopped`. `JobStarted` messages also mark the exact scoped runner ready. Stale `publishing` instances are cancelled and reaped after the bounded boot window. Stale `config-published` instances are reaped only when deleting their exact JIT parameter proves that bootstrap has not claimed it; an already-absent parameter protects the instance as potentially running. This prevents an interrupted control-plane invocation from treating a merely launched or partially configured instance as usable capacity.

## ECS listener

`ecs-listener-main.ts` owns exactly one configured scale set. It resolves the selected GitHub App from the existing SSM parameters, creates one message session, continuously runs the provider-neutral poll loop, and recreates failed sessions with capped equal-jitter backoff. `SIGTERM` and `SIGINT` abort the current poll; session deletion receives a separate bounded signal so it can still run after the poll signal is aborted.

Build the standalone ncc bundle with:

```shell
yarn workspace @aws-github-runner/control-plane build:scale-set-listener
```

Build the pinned Node 24 image from the `lambdas` directory:

```shell
docker build --platform linux/amd64 -f functions/control-plane/Dockerfile.scale-set-listener .
```

The image runs as the upstream `node` user and does not write to the filesystem. Its Docker health check calls `GET /healthz` on container loopback; no load balancer or inbound security-group rule is required. The first successful session creation starts one bounded startup health window so an initial reconciliation can finish. Only a successful poll refreshes liveness and clears failures; reconnecting sessions never reset the timestamp. Repeated session creation followed by first-poll failure therefore becomes stale after `SCALE_SET_HEALTH_STALE_MS`.

Run one ECS service with `desired_count = 1` per scale set. Until a distributed lease is added, configure deployments with minimum healthy percent `0` and maximum percent `100` so old and new tasks do not own overlapping sessions. Give the container at least 120 seconds of stop timeout so the long poll can abort and the session close timeout can elapse.

### Listener environment

Required listener values:

- `SCALE_SET_GITHUB_CONFIG_URL`: GitHub organization or repository URL; enterprise scope is rejected until the compute ownership contract supports it.
- `SCALE_SET_ID`, `SCALE_SET_MIN_RUNNERS`, and `SCALE_SET_MAX_RUNNERS`.
- `SCALE_SET_SESSION_OWNER`: stable owner name for this one listener.
- `PARAMETER_GITHUB_APP_ID_NAME` and `PARAMETER_GITHUB_APP_KEY_BASE64_NAME`: existing colon-aligned SSM parameter lists.
- `SSM_TOKEN_PATH`: existing encrypted runner JIT-config path.
- The existing EC2 provider values: `ENVIRONMENT`, `SUBNET_IDS`, `LAUNCH_TEMPLATE_NAME`, `INSTANCE_TYPES`, `INSTANCE_TARGET_CAPACITY_TYPE`, `SCALE_ERRORS`, and `RUNNER_BOOT_TIME_IN_MINUTES`.

Optional listener values:

- `SCALE_SET_GITHUB_APP_INDEX` (default `0`) and the existing aligned `PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME` list.
- `RUNNER_NAME_PREFIX` (default `""`), `SSM_PARAMETER_STORE_TAGS` (default `[]`), and `SCALE_SET_WORK_FOLDER` (default `_work`).
- `COMPUTE_PROVIDER_TYPE` (currently/default `ec2`).
- `SCALE_SET_RECONNECT_INITIAL_BACKOFF_MS` (default `1000`) and `SCALE_SET_RECONNECT_MAX_BACKOFF_MS` (default `30000`).
- `SCALE_SET_SESSION_CLOSE_TIMEOUT_MS` (default `15000`), `SCALE_SET_HEALTH_PORT` (default `8080`), and `SCALE_SET_HEALTH_STALE_MS` (default `300000`).
- `SCALE_SET_LISTENER_VERSION` and `GIT_COMMIT_SHA` for the Actions service system identity.
- `USER_AGENT` (default `github-aws-runners`) for GitHub and Actions service requests.

Invalid environment configuration exits nonzero. Protocol and non-retryable client errors also exit nonzero; network, throttling, service, and retryable reconciliation errors close the current session and reconnect.

The runner bootstrap must be ephemeral and JIT-enabled because the provider writes GitHub's encoded JIT configuration to the existing SSM runner-config path.

If JIT publication fails ambiguously, the listener first deletes the exact encrypted SSM parameter as a cancellation fence. Only a successful cancellation permits GitHub and compute cleanup; otherwise the protected runner state is preserved for later reconciliation.
