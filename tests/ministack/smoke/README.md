# MiniStack combined smoke test

This directory contains the provider-neutral webhook harness for the
`multi-runner-orchestration` example. The combined entry point also runs the ECS
scale-set controller against that same Terraform deployment. Tests use
MiniStack and a GitHub API MockServer without calling GitHub.

The combined smoke runs webhook EC2, webhook MicroVM, and scale-set EC2 by
default. Scale-set MicroVM coverage is still WIP.

## Entry point

Run the harness from the repository root:

```sh
python3 tests/ministack/run-ministack-smoke.py [--webhook-provider all|ec2|microvm]
```

The default is `all`. Use `--keep-deployment` to retain the temporary Terraform
variables and deployed resources after a failure:

```sh
python3 tests/ministack/run-ministack-smoke.py --keep-deployment
```

The ordinary smoke test requires MiniStack on `AWS_ENDPOINT_URL` and an
already-running MockServer listening on localhost:1080.

Step progress is written to the test step. Detailed subprocess output is
tee'd to `MINISTACK_SMOKE_LOG_FILE` (default: `ministack-smoke.log`) and is
printed to the test step only when a command fails. The smoke runner writes command output to `ministack-smoke.log`, including
Terraform, Packer, Docker, and AWS CLI output.

## Complete execution flow

### 1. Select providers

`run-ministack-smoke.py` creates one `SmokeContext`, selects the requested
webhook and scale-set providers, publishes the scale-set controller image, and
applies `multi-runner-orchestration` once before running each selected
scenario.

### 2. Configure MockServer

`SmokeContext.prepare()` first checks the required local commands and waits for
MockServer. It loads the static expectations from:

```text
tests/ministack/smoke/fixtures/github-api-expectations.json
```

Those expectations cover the GitHub job lookup, installation-token exchange,
runner-group lookup, JIT configuration generation, and registration-token
fallback routes.

Provider-specific expectations are added later when each provider is
configured.

### 3. Create temporary Terraform input

The harness generates a temporary RSA key, replaces the invalid fixture
GitHub App key, and adds the local GitHub Enterprise Server configuration. The
temporary variables also point Terraform at the real Lambda ZIPs:

- `lambdas/functions/control-plane/runners.zip`;
- `lambdas/functions/webhook/webhook.zip`.

The key and temporary variables are removed during cleanup unless
`--keep-deployment` is used.

### 4. Apply the `multi-runner-orchestration` example

The harness invokes:

```sh
tests/ministack/run-example.sh apply multi-runner-orchestration <temporary-tfvars>
```

This deploys the webhook, dispatcher, scale-up, scale-down, pool, EC2, and
MicroVM configuration. After apply, the harness reads the Terraform outputs
for the webhook endpoint and webhook secret.

The webhook endpoint is normally an API Gateway-style hostname such as
`b3855cb6.execute-api.localhost:4566`. Requests are sent to
`localhost:4566` while preserving that hostname in the HTTP `Host` header so
MiniStack routes the request correctly.

### 5. Configure provider expectations

Each provider adds the runner-group and JIT configuration expectations required
by its scale-up Lambda. The MicroVM provider keeps this logic in
`webhook_microvm.py`; EC2 keeps its equivalent provider setup in `webhook_ec2.py`.

The JIT value is an internal MockServer fixture value. It is returned by the
mock GitHub API, written by the scale-up Lambda to MiniStack SSM, and consumed
from SSM by the lifecycle hook. No external JIT configuration variable is
required.

### 6. Run the standard scale-up scenario

For job `123456`, the harness:

1. Deletes the provider's cached runner-group parameter.
2. Clears MockServer request history.
3. Creates and signs a `workflow_job` webhook using the configured secret.
4. Sends the webhook to the deployed endpoint.
5. Waits for the webhook, dispatcher, and provider scale-up Lambda logs.
6. Verifies the GitHub token and queued-job API routes.
7. Discovers the created compute resource.
8. Verifies provider-specific resource state and ownership metadata.

For EC2 this resource is an instance. For MicroVM it is a MicroVM plus SSM
metadata under the configured MicroVM paths.

### 7. Exercise the MicroVM lifecycle hook

When the `microvm` provider is selected, the harness automatically builds and
starts the lifecycle-hook container on `127.0.0.1:8080`:

```sh
python3 tests/ministack/run-ministack-smoke.py --webhook-provider microvm
```

When enabled, `MicrovmProvider.configure()` builds and starts the local image
once before the lifecycle scenarios:

1. Reads the `microvm` Terraform output.
2. Logs in to MiniStack ECR.
3. Pulls, tags, and pushes the ARM64 Ubuntu base image.
4. Exports the MicroVM foundation outputs to the Packer environment.
5. Runs `packer build .` from `images/microvm-ubuntu`.
6. Copies the lifecycle-hook ZIP already produced by CI into the Docker build
   context.
7. Builds the `microvm-lifecycle-hook` ARM64 Docker image.
8. Starts the `microvm-lifecycle-hook` container with Docker's default bridge
   network, publishes `8080:8080`, and waits for its readiness endpoint. The
   `host.docker.internal` host-gateway mapping lets it reach MiniStack on the
   host-published port.

After the MicroVM scale-up creates the resource, the test waits for the SSM
JIT parameter created by that scale-up. It then sends the same version-1
`runHookPayload` shape used by the MicroVM control-plane code when it calls
`RunMicrovm`:

```json
{
  "version": 1,
  "imageArn": "<image returned by the MicroVM>",
  "imageVersion": "<version returned by the MicroVM>",
  "runnerConfigSsmPath": "/github-action-runners/multi-runner-webhook/microvm/runners/config",
  "runnerTokenSsmPath": "/github-action-runners/multi-runner-webhook/microvm/runners/tokens"
}
```

The outer request contains the MicroVM identifier and the payload encoded as a
JSON string. The hook uses the MicroVM identifier and token path to consume the
JIT value written by scale-up. The test waits until the token parameter is
gone, proving that the one-time SSM value was consumed.

The image build is guarded by the provider instance and happens only once per
smoke-test run, not once per scale-up.

The lifecycle ZIP must already exist at:

```text
lambdas/services/microvm-lifecycle-hooks/microvm-lifecycle-hooks.zip
```

The CI pipeline produces this artifact before running the MicroVM image build.

### 8. Run the standard scale-down scenario

The provider-specific scale-down implementation:

1. Adds MockServer runner-list, runner-detail, and delete expectations.
2. Keeps all active smoke resources visible and marks only the selected runner
   as removable.
3. Invokes the provider scale-down Lambda directly.
4. Waits for the scale-down log marker.
5. Verifies the installation-token, runner-list, runner-detail, and runner
   deletion routes.
6. Changes the selected runner lookup to HTTP 404.
7. Verifies that the compute resource is terminated.

For MicroVM, the hook termination endpoint is also called after the resource
termination check.

### 9. Run the dynamic-label scenario

The same scale-up and scale-down sequence is repeated for job `123457`, but
the event includes the provider-specific dynamic label:

- EC2: `ghr-ec2-instance-type:m5.large`;
- MicroVM: `ghr-microvm-image-version:3.0`.

The test verifies that the resource uses the requested dynamic configuration.

### 10. Run the pool scenario

The pool path is invoked directly rather than through a webhook:

```json
{"poolSize": 1, "type": "ec2|microvm"}
```

The harness verifies the pool GitHub routes, discovers the created resource,
checks its provider-specific state, and then performs the same scale-down
assertions.

### 11. Cleanup

On success or failure, the harness:

- removes the local MicroVM Docker container when used;
- terminates discovered EC2 instances;
- terminates discovered MicroVMs;
- destroys the `multi-runner-orchestration` Terraform deployment;
- removes temporary variables and response files.

Use `--keep-deployment` or `MINISTACK_SMOKE_KEEP_DEPLOYMENT=1` when the
Terraform deployment and temporary variables are needed for investigation.

## Provider responsibilities

| File | Responsibility |
| --- | --- |
| `webhook_scenario.py` | Shared standard, dynamic, pool, and scale-down scenarios |
| `webhook_provider.py` | Provider interface and resource abstraction |
| `webhook_ec2.py` | EC2 discovery, tag assertions, and termination |
| `webhook_microvm.py` | MicroVM discovery, metadata assertions, image build, hook handoff, and termination |
| `common.py` | Terraform, AWS CLI, HTTP, MockServer, and cleanup plumbing |
| `fixtures/` | GitHub API, workflow-job, and scale-set controller fixtures |
| `scale_set_scenario.py` | ECS scale-set image deployment and controller protocol scenario |
| `scale_set_provider.py` | Provider interface for scale-set runner lifecycle assertions |
| `scale_set_ec2.py` | EC2 runner discovery, ownership checks, and scale-down polling |

## Troubleshooting

For a retained deployment, inspect Terraform state and outputs from:

```sh
terraform -chdir=examples/multi-runner-orchestration output
```

If a route assertion times out, check the relevant Lambda log group and the
MockServer request history. If the MicroVM hook is enabled, confirm that the
container is ready at:

```sh
curl --fail --request POST \
  http://127.0.0.1:8080/aws/lambda-microvms/runtime/v1/ready
```

## ECS scale-set integration smoke

The combined entry point runs the ECS controller protocol after the selected
webhook scenarios. It builds and publishes the controller image, configures
the same `multi-runner-webhook` deployment with the `ec2_scalet_set` lane, and
applies Terraform once:

```sh
python3 tests/ministack/run-ministack-smoke.py
```

It checks the SSM reconciler manifest, ECS task definition and log group,
controller runtime log markers, GitHub API protocol routes, and the created
scale-set EC2 runner. For scale-down it changes the reconciler minimum to zero,
deploys a fresh controller task revision, and waits for the runner to terminate
and the controller session DELETE request to reach MockServer. Scale-set
MicroVM coverage is WIP.

MiniStack must have its Docker engine socket mounted at `/var/run/docker.sock`.
ECS task metadata can report a task as running without this socket, but MiniStack
cannot start the controller's Docker container for the smoke to inspect.
The controller reaches MockServer at `https://host.docker.internal:1080` to
satisfy the GitHub Enterprise URL contract; MockServer supports HTTP and HTTPS
on the same port. The smoke process loads and verifies expectations at
`http://localhost:1080`. Both addresses and port 1080 are fixed in the runner.

The combined entry point writes `ministack-smoke.log` once for the full run.
Progress is printed to stdout; detailed subprocess output goes to the log and
is printed only when a command fails. Polling commands are kept out of the
detailed log; controller and ECS/Docker state is recorded once when startup
times out. Set `MINISTACK_SMOKE_LOG_FILE` to choose another log path. Use
`--keep-deployment` (or
`MINISTACK_SMOKE_KEEP_DEPLOYMENT=1`) to retain the Terraform inputs and
deployment for debugging; the temporary GitHub App private key is still
removed during cleanup.

Both scenario modules use the same provider-adapter pattern. The webhook
scenario exposes `run(context, provider)`; the scale-set scenario exposes
`prepare(context, provider)` and `run(context, provider, image_reference)`
because it must publish its controller image and load MockServer fixtures
before applying the shared Terraform deployment. The `ScaleSetProvider`
interface in `scale_set_provider.py` isolates runner discovery and lifecycle
checks; `scale_set_ec2.py` is the current adapter. Add future scale-set compute
providers as adapters implementing this interface. The shared `SmokeContext`
owns commands, logging, and deployment cleanup.

`run-ministack-smoke.py` owns the shared deployment lifecycle and logging.
