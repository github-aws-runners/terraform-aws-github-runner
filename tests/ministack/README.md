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

## Webhook-to-scale-up smoke test

The smoke test sends a signed `workflow_job` webhook through the API Gateway
endpoint and verifies the asynchronous path through EventBridge, the
dispatcher Lambda, SQS, and the scale-up Lambda. The scale-up Lambda calls a
pinned `mockserver/mockserver` container initialized from
`github-api-expectations.json`; the test uses MockServer's verification API to
confirm the expected GitHub API calls. It also checks the webhook, dispatcher,
and scale-up Lambda log groups for the smoke job ID.

Build the two real Lambda distributions, start MiniStack, and run:

```sh
(cd lambdas && yarn install --frozen-lockfile)
(cd lambdas && yarn workspace @aws-github-runner/webhook dist)
(cd lambdas && yarn workspace @aws-github-runner/control-plane dist)
sh tests/ministack/run-smoke.sh
```

The smoke script generates a temporary RSA key and Terraform variables file,
starts the MockServer container on a temporary port, and removes all temporary
state during cleanup. MiniStack must be able to reach `host.docker.internal`;
override the hostname with `MINISTACK_GITHUB_MOCK_HOST` when using a different
container runtime. When MiniStack is exposed on a non-default local port, use a
host address reachable from its container for `AWS_ENDPOINT_URL`, for example
`AWS_ENDPOINT_URL=http://<host-ip>:14568`, instead of `127.0.0.1`.
