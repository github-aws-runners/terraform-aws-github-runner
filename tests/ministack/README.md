# MiniStack example tests

The MiniStack workflow runs the `base`, `prebuilt`, `default`, `ephemeral`,
`multi-runner`, and `termination-watcher` examples directly with Terraform
1.4.0 and the latest Terraform release.
The examples with input variables get their inputs from their own tfvars files
in this directory. The `termination-watcher` example has no input variables
and uses the configuration checked into the example itself. No override files,
setup module, or checked-in Terraform fixture configuration is used. The
helper creates and removes a temporary AMI override for `default` and
`ephemeral`, and temporary SSM parameters for `multi-runner`.

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
during cleanup. MiniStack v1.5.7 provides the EC2 image behavior needed by the
`default`, `ephemeral`, and `multi-runner` examples, so they are included in
the same lifecycle matrix.

## Webhook and runner lifecycle smoke test

The smoke test covers two independent lifecycle chains. The webhook chain
sends signed `workflow_job` webhooks through the API Gateway endpoint and
verifies the asynchronous path through EventBridge, the dispatcher Lambda, SQS,
and the scale-up Lambda. It runs scale-up once without a dynamic label and once
with `ghr-ec2-instance-type:m5.large`, checking that the first launch uses a
configured default instance type and the second launch uses exactly `m5.large`.
The scale-up Lambda calls a pinned `mockserver/mockserver` container initialized
from `github-api-expectations.json`; the test uses MockServer's verification API
to confirm the expected GitHub API calls for both jobs. It also checks the
webhook, dispatcher, and scale-up Lambda log groups for each smoke job ID, then
confirms that both MiniStack EC2 runner instances are removed and terminated.

The second, pool chain then invokes the pool Lambda with a pool size of one and verifies every
expected GitHub API route for pool reconciliation, including the installation,
token, runner-list, and registration-token calls, before confirming that it
creates a second EC2 runner. Installation lookup is mocked for configurations
that do not provide a stored installation ID, but is conditional and is not a
required assertion. The test also verifies the `ghr:Application`,
`ghr:created_by`, `ghr:Type`, and `ghr:Owner` tags used to discover managed
instances. MiniStack does not currently propagate the Terraform launch-template
`ghr:environment` tag to instances, so that tag is not asserted by this smoke
test. For both the scale-up and pool runners, it invokes the
scale-down Lambda and verifies every required GitHub API route, including token
creation, runner listing, runner-state lookup, and runner deletion. It then
verifies the GitHub runner `404`, checks the
scale-down log entry as supplementary evidence, and verifies EC2 termination.
The pool schedule is configured for a far-future date because the test invokes
the Lambda directly.

Build the two real Lambda distributions, start MiniStack, and run:

```sh
(cd lambdas && yarn install --frozen-lockfile)
(cd lambdas && yarn workspace @aws-github-runner/webhook dist)
(cd lambdas && yarn workspace @aws-github-runner/control-plane dist)
sh tests/ministack/run-smoke.sh
```

The smoke script generates a temporary RSA key and Terraform variables file,
starts the MockServer container on a temporary port, and removes all temporary
state during cleanup. In CI, the pinned MockServer setup action starts the
server and waits for readiness; the expectations are loaded after checkout.
MiniStack must be able to reach
`host.docker.internal`;
override the hostname with `MINISTACK_GITHUB_MOCK_HOST` when using a different
container runtime. When MiniStack is exposed on a non-default local port, use a
host address reachable from its container for `AWS_ENDPOINT_URL`, for example
`AWS_ENDPOINT_URL=http://<host-ip>:14568`, instead of `127.0.0.1`.
