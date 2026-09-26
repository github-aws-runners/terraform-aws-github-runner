# MiniStack example tests

The MiniStack workflow applies the `base`, `prebuilt`, `default`, `ephemeral`,
`multi-runner`, and `termination-watcher` examples with Terraform and OpenTofu.
The combined webhook and scale-set example is exercised by the Python smoke
workflow, which applies it once and tests webhook EC2, webhook MicroVM, and
scale-set EC2.

The examples with input variables get their inputs from their own tfvars files
in this directory. The `microvm-foundation` example uses the reusable `base`
example module to create its VPC and private subnets, then wires those outputs
into the MicroVM Network Connector. The `termination-watcher` example has no
input variables and uses the configuration checked into the example itself. No
override files, setup module, or Terraform fixture configuration is checked in.
The helper creates and removes a temporary AMI override for `default` and
`ephemeral`, and temporary SSM parameters for `multi-runner`. The migration test
uses its dedicated `run-migration-test.sh` lifecycle script.

Start MiniStack, set the AWS endpoint and test credentials, then run:

```sh
tests/ministack/run-example.sh apply base
# or
tests/ministack/run-example.sh apply prebuilt
# or
tests/ministack/run-example.sh apply default
# or
tests/ministack/run-example.sh apply ephemeral
# or
tests/ministack/run-example.sh apply multi-runner
# or
tests/ministack/run-example.sh apply termination-watcher
```

The script also supports `init`, `plan`, and `destroy`. It creates inert Lambda
ZIP fixtures in the paths expected by the modules when they are absent, and
removes only the files it created. For `prebuilt`, it seeds AMI metadata through
MiniStack's AWS-compatible EC2 API, then removes only the resources it created
during cleanup. MiniStack v1.5.11 provides the EC2 image behavior needed by the
`default`, `ephemeral`, and `multi-runner` examples, so they are included in the
same lifecycle matrix.

## Webhook and runner lifecycle smoke test

The smoke test covers two independent lifecycle chains. The webhook chain
sends signed `workflow_job` webhooks through the API Gateway endpoint and
verifies the asynchronous path through EventBridge, the dispatcher Lambda, SQS,
and the scale-up Lambda. Each provider runs scale-up once without a dynamic
label and once with a provider-specific dynamic label, checking the provider's
resolved resource configuration.
The smoke runner connects to an already-running MockServer initialized from
`github-api-expectations.json`; it uses MockServer's verification API to confirm
the expected GitHub API calls for both jobs. It also checks the
webhook, dispatcher, and scale-up Lambda log groups for each smoke job ID, then
confirms that each provider resource is removed and terminated.

The second, pool chain then invokes the pool Lambda with a pool size of one and verifies every
expected GitHub API route for pool reconciliation, including the installation,
token, runner-list, and registration-token calls, before confirming that it
creates a second provider runner. Installation lookup is mocked for configurations
that do not provide a stored installation ID, but is conditional and is not a
required assertion. The test also verifies the `ghr:Application`,
`ghr:created_by`, `ghr:Type`, and `ghr:Owner` tags used to discover managed
instances. MiniStack v1.5.15 propagates the Terraform launch-template tags to
instances, allowing the scale-down Lambda to discover and remove each runner.
The smoke test invokes scale-down for the webhook and pool-created runners and
verifies the GitHub API calls and EC2 termination.
The pool schedule is configured for a far-future date because the test invokes
the Lambda directly.

The smoke deployment uses the `multi-runner-orchestration` example, which creates
both EC2 and MicroVM lanes behind one webhook endpoint. For each provider, the
shared lifecycle runs scale-up without a dynamic label, scale-up with a dynamic
label, one pool scale-up, and scale-down for all three resources. The provider
implementation supplies the event labels, resource discovery, provider-specific
route checks, and compute-resource assertions. The shared example accepts the
built runner-control and webhook Lambda ZIP files as `runners_lambda_zip` and
`webhook_lambda_zip`.

To exercise the MicroVM image's lifecycle hook after each MicroVM scale-up, start
the image locally and provide its hook URL. The hook container must use the same
MiniStack endpoint as the smoke test. The scale-up Lambda creates the JIT config
in SSM; the smoke test sends the same `runHookPayload` to the hook, which consumes
that SSM value.

```sh
python3 tests/ministack/run-ministack-smoke.py --webhook-provider microvm
```

The test sends the outer JSON request with `runHookPayload` encoded as a JSON
string, then waits for
`/github-action-runners/multi-runner-webhook/microvm/runners/tokens/<microvm-id>`
to disappear. This proves that the lifecycle hook consumed the one-time SSM
value before the MicroVM is scaled down.

### Start MiniStack and MockServer with Docker

The smoke expects MiniStack on port `4566` and MockServer on port `1080`. Start
both containers before running the smoke. MiniStack needs the Docker socket
mounted so its ECS integration can launch the scale-set controller container.
It also needs a host-gateway entry so that the controller can reach MockServer
at `host.docker.internal:1080`.

```sh
docker run --detach \
  --name ministack \
  --publish 4566:4566 \
  --add-host=host.docker.internal:host-gateway \
  --volume /var/run/docker.sock:/var/run/docker.sock \
  --env MINISTACK_ACCOUNT_ID=000000000000 \
  --env MINISTACK_REGION=eu-west-1 \
  ghcr.io/ministackorg/ministack:latest

docker run --detach \
  --name ministack-mockserver \
  --publish 1080:1080 \
  mockserver/mockserver:7.6.0
```

Wait for MockServer to become ready:

```sh
until curl --silent --show-error --fail --request PUT \
  http://localhost:1080/mockserver/status; do
  sleep 2
done
```

The smoke process uses `http://localhost:1080`; the controller container uses
`https://host.docker.internal:1080`. The smoke runner loads its GitHub API
expectations into MockServer when it starts. To stop and remove the containers
after the run:

```sh
docker rm --force ministack ministack-mockserver
```

Build the smoke Lambda archives and run:

```sh
./.ci/build.sh
# This runs webhook EC2/MicroVM and scale-set EC2 in one deployment.
python3 tests/ministack/run-ministack-smoke.py
# Preserve the deployment and temporary tfvars file for debugging:
python3 tests/ministack/run-ministack-smoke.py --keep-deployment
# Run one provider explicitly when debugging:
python3 tests/ministack/run-ministack-smoke.py --webhook-provider ec2
python3 tests/ministack/run-ministack-smoke.py --webhook-provider microvm
# Select the scale-set compute provider explicitly:
python3 tests/ministack/run-ministack-smoke.py --scale-set-provider ec2
```

The runner writes detailed command output to `ministack-smoke.log`.

The Python `smoke/webhook_scenario.py` module owns the provider-neutral scenarios, and
`smoke/webhook_provider.py` defines the provider interface. Shared webhook delivery, log
polling, MockServer route verification, GitHub runner-state fixtures, and Lambda
invocation helpers live in `smoke/common.py`. To add a provider, implement the
interface under `smoke/`, register the provider in
`run-ministack-smoke.py`, and add its provider-specific assertions. Scale-set
MicroVM coverage remains WIP; the combined run currently covers scale-set EC2.

The smoke script generates a temporary RSA key and Terraform variables file,
expects an already-running MockServer on localhost:1080, loads the
expectations into it, and destroys the Terraform deployment during cleanup.
Pass `--keep-deployment` (or set `MINISTACK_SMOKE_KEEP_DEPLOYMENT=1`) to retain
the deployment for debugging; it prints the generated tfvars path so the
deployment can be destroyed separately with `tests/ministack/run-example.sh destroy`.
MockServer is an external test dependency; the Python smoke runner does not
start or stop it. In CI, the setup action starts it on localhost:1080 and waits
for readiness. The smoke process connects to `http://localhost:1080`; the
MiniStack controller connects to `https://host.docker.internal:1080`. MiniStack
must resolve `host.docker.internal` to the host gateway. When MiniStack is
exposed on a non-default local port, set `AWS_ENDPOINT_URL` to a host address
reachable from its container, such as `http://<host-ip>:14568`, instead of
`localhost`.

The combined smoke writes one command log for webhook EC2/MicroVM and
scale-set EC2. It applies the `multi-runner-orchestration` example once. MiniStack
must have its Docker engine socket mounted at `/var/run/docker.sock` so ECS can
start the controller container; without it the ECS API may report tasks
without creating Docker containers.
