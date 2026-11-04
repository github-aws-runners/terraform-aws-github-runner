# MiniStack smoke tests for multi-runner orchestration

These Docker Compose smoke tests apply `examples/multi-runner-orchestration` to MiniStack and exercise the webhook, pool, and scale-set EC2 flows. They use WireMock as the GitHub API test double. The mock accepts the API calls used by these scenarios; it is not a complete GitHub emulator.

## Run locally

Run from the repository root. Docker Compose v2, Buildx, and access to the Docker socket are required. The socket lets MiniStack start its nested ECS containers and lets Buildx build the scale-set controller image.

```sh
compose_file=tests/multi-runner-orchestration/docker-compose.yml

docker compose --parallel 1 -f "$compose_file" pull
docker compose --parallel 1 -f "$compose_file" build
docker compose --parallel 1 -f "$compose_file" run --no-TTY --rm smoke-tests
```

`run smoke-tests` starts the required Compose dependencies and waits for `terraform-apply` to complete successfully before running the tests. The apply step seeds the MiniStack fixtures, builds Lambda artifacts and the scale-set controller image, and applies the example. The smoke-test command runs suites sequentially and returns a failing exit code if any scenario fails. Compose leaves the long-running MiniStack and GitHub API services available after the test command exits.

On failure, inspect MiniStack and Lambda output with:

```sh
docker compose -f "$compose_file" logs --no-color --timestamps --tail=all ministack
```

Stop the stack when finished:

```sh
docker compose -f "$compose_file" down --remove-orphans
```

The GitHub API image copies `mappings/` at build time. Rebuild and recreate the `github-api` service after changing a mapping so WireMock loads the updated fixture:

```sh
docker compose --parallel 1 -f "$compose_file" build github-api
docker compose -f "$compose_file" up --detach --force-recreate github-api
```

## Current scenarios

- `smoke/webhook.ec2.test.mjs`: standard-label and dynamic-label (`m5.large`) webhook jobs, plus an EC2 pool invocation. It checks webhook delivery, parsing and dispatch, runner-group cache miss and lookup, EC2 launch configuration, and cleanup.
- `smoke/scale-set.ec2.test.mjs`: checks the zero-runner baseline, reconciliation to one EC2 runner, and scale-down to zero.

Each scenario checks CloudWatch messages and AWS CLI state. Webhook and pool cleanup invoke scale-down twice: the first pass marks an instance orphaned when the mock reports no registered runner, and the next confirms the runner is absent by ID and terminates the instance. The runner-list and runner-by-ID fixtures support this behavior.

The smoke tests are under `smoke/` and are discovered by the `*.test.mjs` pattern in the Compose command. Shared helpers are grouped by responsibility in `support.aws.mjs`, `support.webhook.mjs`, and `support.scale-set.mjs`; keep scenario assertions and provider-specific checks in the provider test file.

## Adding a scenario or compute provider

Name a suite `<trigger>.<compute-provider>.test.mjs`, for example `webhook.microvm.test.mjs` or `scale-set.microvm.test.mjs`. Add a clear sequence of actions and checks for the trigger, scale-up, provider configuration, and cleanup. Add only the GitHub API mappings that scenario exercises, using filenames of the form `<trigger>.<compute-provider>.<request>.json` in `mappings/`. New `*.test.mjs` files are picked up automatically.

The fixtures are for the active smoke paths; add coverage for other API interactions in a separate change when needed.

## Compose and architecture notes

The Compose stack uses the `multi-runner-orchestration_default` network. MiniStack and nested ECS containers reach services by DNS name (`ministack` and `github-api`). The control-plane GitHub API client uses `http://github-api:8080`; the scale-set controller uses the HTTPS mock endpoint and a test config with `forceGhes: true` and `sslVerify: false`.

The Buildx service selects `linux/amd64` or `linux/arm64` from the Docker daemon architecture for the scale-set controller image. The Terraform apply service sets the example's runner architecture to `X86_64` or `ARM64` based on its host architecture. Compose runs the resource-intensive build services sequentially in CI with `--parallel 1`.

## CI

[`.github/workflows/smoke-tests.yml`](../../.github/workflows/smoke-tests.yml) pulls and builds the Compose images with `--parallel 1`, then runs `smoke-tests`. If the job fails, the workflow prints the MiniStack container logs.
