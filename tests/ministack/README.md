# MiniStack example tests

The MiniStack workflow runs the `base`, `prebuilt`, `default`, `ephemeral`,
`multi-runner`, and `termination-watcher` examples directly
with Terraform 1.5.6 and the latest Terraform release, and with OpenTofu 1.11
and the latest OpenTofu release.
The examples with input variables get their inputs from their own tfvars files
in this directory. The `microvm-foundation` example uses the reusable `base`
example module to create its VPC and private subnets, then wires those outputs
into the MicroVM Network Connector. The `termination-watcher` example has no input variables
and uses the configuration checked into the example itself. No override files,
setup module, or Terraform fixture configuration is checked in. The helper
creates and removes a temporary AMI override for `default` and
`ephemeral`, and temporary SSM parameters for `multi-runner`. The migration
test uses its dedicated
`run-migration-test.sh` lifecycle script.

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
`default`, `ephemeral`, and `multi-runner` examples, so they are included in
the same lifecycle matrix.

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
instances. MiniStack v1.5.10 propagates the Terraform launch-template tags to
instances, allowing the scale-down Lambda to discover and remove each runner.
The smoke test invokes scale-down for the webhook and pool-created runners and
verifies the GitHub API calls and EC2 termination.
The pool schedule is configured for a far-future date because the test invokes
the Lambda directly.

The smoke deployment uses the `multi-runner-webhook` example, which creates
both EC2 and MicroVM lanes behind one webhook endpoint. For each provider, the
shared lifecycle runs scale-up without a dynamic label, scale-up with a dynamic
label, one pool scale-up, and scale-down for all three resources. The provider
implementation supplies the event labels, resource discovery, provider-specific
route checks, and compute-resource assertions. The shared example accepts the
built runner-control and webhook Lambda ZIP files as `runners_lambda_zip` and
`webhook_lambda_zip`.

Build the two real Lambda distributions, start MockServer and MiniStack, and run:

```sh
(cd lambdas && yarn install --frozen-lockfile)
(cd lambdas && yarn workspace @aws-github-runner/webhook dist)
(cd lambdas && yarn workspace @aws-github-runner/control-plane dist)
# Run both provider lanes in one deployment. MockServer must already be running
# and MINISTACK_GITHUB_MOCK_URL must point to it:
MINISTACK_GITHUB_MOCK_URL=http://localhost:1080 \
  python3 tests/ministack/run-webhook-smoke.py
# Preserve the deployment and temporary tfvars file for debugging:
MINISTACK_GITHUB_MOCK_URL=http://localhost:1080 \
  python3 tests/ministack/run-webhook-smoke.py --keep-deployment
# Run one provider explicitly when debugging:
MINISTACK_GITHUB_MOCK_URL=http://localhost:1080 \
  python3 tests/ministack/run-webhook-smoke.py ec2
MINISTACK_GITHUB_MOCK_URL=http://localhost:1080 \
  python3 tests/ministack/run-webhook-smoke.py microvm
```

The runner writes `ministack-smoke-checklist.txt` in the current directory and
updates it throughout the run. Override the destination with
`MINISTACK_SMOKE_CHECKLIST_FILE` when the file should be retained as a CI
artifact.

The Python `smoke/lifecycle.py` module owns the provider-neutral scenarios, and
`smoke/provider.py` defines the provider interface. Shared webhook delivery, log
polling, MockServer route verification, GitHub runner-state fixtures, and Lambda
invocation helpers live in `smoke/common.py`. To add a provider, implement the
interface under `smoke/`, register the provider in
`run-webhook-smoke.py`, and add its provider-specific assertions.

The smoke script generates a temporary RSA key and Terraform variables file,
expects an already-running MockServer at `MINISTACK_GITHUB_MOCK_URL`, loads the
expectations into it, and destroys the Terraform deployment during cleanup.
Pass `--keep-deployment` (or set `MINISTACK_SMOKE_KEEP_DEPLOYMENT=1`) to retain
the deployment for debugging; it prints the generated tfvars path so the
deployment can be destroyed separately with `tests/ministack/run-example.sh destroy`.
The MockServer lifecycle is an external test dependency; the Python smoke runner
does not start or stop Docker containers. In CI, the MockServer setup action
starts the server and waits for readiness before the Python smoke runner executes.
MiniStack must be able to reach
`host.docker.internal`;
override the hostname with `MINISTACK_GITHUB_MOCK_HOST` when using a different
container runtime. When MiniStack is exposed on a non-default local port, use a
host address reachable from its container for `AWS_ENDPOINT_URL`, for example
`AWS_ENDPOINT_URL=http://<host-ip>:14568`, instead of `localhost`.
