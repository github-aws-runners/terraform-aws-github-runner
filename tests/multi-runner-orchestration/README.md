# WireMock for `terraform-aws-github-runner` Lambdas

This standalone WireMock instance contains happy-path stubs for the GitHub REST and GitHub Actions scale-set calls found under `lambdas/`. It accepts both the GitHub Cloud path form (`/repos/...`) and the GHES form (`/api/v3/repos/...`). It is a deterministic test double, not a complete GitHub emulator.

## Start it

From the repository root:

```sh
docker compose -f tests/multi-runner-orchestration/docker-compose.yml up --build --detach
curl --fail http://localhost:8080/__admin/mappings
```

The server listens on HTTP `8080` and HTTPS `8443`. The self-signed certificate is only for local/CI testing. Scale-set protocol responses contain the same HTTPS base URL used for its registration handshake. The scale-set test config must set `sslVerify: false` for this test certificate.

To stop it:

```sh
docker compose -f tests/multi-runner-orchestration/docker-compose.yml down
```

## MiniStack fixtures

`docker compose -f tests/multi-runner-orchestration/docker-compose.yml up --build` runs `.ci/build.sh` to build the Lambda distributions, starts MiniStack, seeds AMIs and the `scale-set-controller` ECR repository/policy, builds the controller for `linux/amd64` and `linux/arm64`, and pushes it to MiniStack. The Compose services use `linux/amd64`; CI enables QEMU to build the ARM64 image on its AMD64 runner.

The controller image build is configured directly in the `docker-buildx` Compose service; it is not a fixture in `fixtures/ministack-fixtures.json`. Compose creates the `multi-runner-orchestration` network and attaches MiniStack's nested ECS containers to it. The AWS CLI uses `ministack:4566` to reach MiniStack. The job resolves MiniStack's network IP for BuildKit's registry push, since BuildKit does not resolve Compose service DNS in this setup; it configures that registry as plain HTTP.

## Programmatic MiniStack smoke test

Compose owns the environment lifecycle: `run smoke-tests` starts the required WireMock and MiniStack dependencies, seeds AWS fixtures, builds the Lambda archives and scale-set controller image, applies `examples/multi-runner-orchestration`, then runs the smoke-test container. The command streams the Node.js reporter output and returns the smoke container's exit code. The job first registers a scale-set task-definition revision with dummy MiniStack credentials and updates the ECS service:

```sh
docker compose -f tests/multi-runner-orchestration/docker-compose.yml build
docker compose -f tests/multi-runner-orchestration/docker-compose.yml run --no-TTY --rm smoke-tests
```

Stop the long-running MiniStack and WireMock services after the command finishes:

```sh
docker compose -f tests/multi-runner-orchestration/docker-compose.yml down --remove-orphans
```

Name smoke suites `<trigger>.<compute-provider>.test.mjs`; the current suites are `webhook.ec2.test.mjs` and `scale-set.ec2.test.mjs`. To cover MicroVM, add `webhook.microvm.test.mjs` and/or `scale-set.microvm.test.mjs`. Webhook suites can reuse `sendWorkflowJob` and shared AWS/CloudWatch helpers from `smoke/support.mjs`; scale-set suites can register the common lifecycle with `registerScaleSetLifecycleTest` from `smoke/scale-set-support.mjs` and provide provider-specific reconciliation assertions. Keep resource checks and cleanup provider-specific. The `*.test.mjs` command discovers new suites automatically. The suite contains four named Node.js test cases: EC2 webhook scale-up and scale-down with standard labels, EC2 webhook scale-up and scale-down with a dynamic instance-type label, EC2 pool runner creation and scale-down, and EC2 scale-set scale-up and scale-down. The webhook and pool cases assert the EC2 runner count before launch, after launch, and after cleanup; the dynamic-label case also verifies the requested `m5.large` override in the scale-up logs. The scale-set case checks zero runners at baseline, one runner after scale-up, and a termination returning the count to zero. All cases assert the corresponding Lambda or controller CloudWatch logs. WireMock API responses are test fixtures, so the tests do not assert those routes. Run the smoke cases with the concise reporter:

MiniStack does not start the EC2 runner agent, so the webhook and pool tests invoke scale-down twice: the first pass marks the unregistered instance orphaned, and the next pass confirms it is absent from GitHub and terminates it.

```sh
node --test --test-concurrency=1 \
  --test-reporter=./tests/multi-runner-orchestration/smoke/reporter.mjs \
  tests/multi-runner-orchestration/smoke/*.test.mjs
```

The scale-set check registers temporary ECS task-definition revisions with the requested minimum runner count and dummy MiniStack credentials, then updates the local ECS service to exercise reconciliation. The Compose MiniStack container owns the ephemeral AWS state.

## Route the Lambdas to the mock

The Compose stack uses the named `multi-runner-orchestration_default` network. MiniStack and its nested ECS containers join that network, so use service DNS names (`ministack` and `github-api`) from containers. For the control-plane and termination-watcher Octokit clients, set `GHES_URL=http://github-api:8080`. Their existing GHES URL handling appends `/api/v3`, which these mappings accept. The webhook itself is inbound to the webhook Lambda; send your signed `workflow_job` fixture to that Lambda's local/API Gateway endpoint. The subsequent GitHub API calls are handled by this mock.

For the scale-set controller, use a test config with `githubConfigUrl: "https://localhost:8443/acme"` for a host-run test (or `https://github-api:8443/acme` from the Compose network), `forceGhes: true`, and `sslVerify: false`. The mock supplies the scale-set admin handshake, scale-set/session responses, and an empty long-poll response. The controller should then remain healthy and poll until your test stops it.

Scale-set stubs follow `lambdas/libs/github-actions-scale-set/src/endpoints.ts`, `client.ts`, and `message-session-client.ts`. They accept the tenant-scoped `/{tenant}/_apis/...` paths returned by the registration handshake and return the `/messages?sessionId=...` queue URL used by the MiniStack initializer fixture. The fixture currently uses tenant `123`, runner group `48`, scale set `223`, and runner `321`.

The mock does not validate GitHub App JWTs, installation permissions, runner token validity, or GitHub's authorization policy. It accepts any request matching a mapping. It also does not implement the runner agent's actual Actions service protocol; the scale-set routes here support the Lambda controller's HTTP client only.

## GitHub API mappings used by this smoke suite

The mappings directory contains only the requests exercised by the current MiniStack smoke paths:

| Flow | Requests covered |
|---|---|
| Webhook and EC2 pool | `POST /app/installations/{id}/access_tokens`; `GET /orgs/{org}/installation` (pool installation lookup); `POST /orgs/{org}/actions/runners/registration-token`; `GET /orgs/{org}/actions/runners`; `GET /orgs/{org}/actions/runner-groups`; `POST /orgs/{org}/actions/runners/generate-jitconfig`; `GET /orgs/{org}/actions/runners/{runner_id}` during orphan cleanup; `GET /repos/{owner}/{repo}/actions/jobs/{job_id}` |
| EC2 scale set | Registration handshake; runner-group and scale-set lookup/update; JIT runner config; message-session create/close and empty queue polling; runner lookup by name and removal |

Mapping filenames use `<trigger>.<compute-provider>.<request>.json`; add provider-specific files alongside the matching smoke suite when new paths are exercised. Fixtures for other GitHub API paths can be added in a follow-up.

## CI usage

Build and run this image before the Lambda integration step, then set the API URL/environment above in that step. For example, from a GitHub Actions job running on the host:

```yaml
- name: Start GitHub API mock
  run: |
    docker build -t local/github-api-mock ./tests/multi-runner-orchestration
    docker run -d --name github-api-mock \
      -p 8080:8080 -p 8443:8443 \
      local/github-api-mock

- name: Run Lambda smoke test
  env:
    GHES_URL: http://127.0.0.1:8080
  run: <your-lambda-smoke-command>

- name: Stop GitHub API mock
  if: always()
  run: docker rm -f github-api-mock
```

If the Lambdas run in job containers instead of on the host, put them and the mock on the same user-defined Docker network. Use `GHES_URL=http://github-api-mock:8080` for Octokit and `githubConfigUrl=https://github-api-mock:8443/acme` for the scale-set controller. The handshake/session mappings derive the queue URL from the incoming request base URL.

## Limits and current code routing

Most Lambdas already support a configurable GHES API base (`GHES_URL` or the scale-set `githubConfigUrl`), so the mock can be used without changing their request code. `gh-agent-syncer` currently constructs a default `Octokit` client, so its release API request still targets `api.github.com` unless that Lambda is given an API base URL override or the test adds a host-level redirect. The mock includes the endpoint and download fixture, but it cannot intercept that hard-coded client by itself. The release fixture is the Linux x64 archive used by the default syncer settings; adjust its mapping for a different OS/architecture.

Unmatched requests return WireMock's normal 404 with request-match diagnostics. Inspect received calls at `http://localhost:8080/__admin/requests`.
