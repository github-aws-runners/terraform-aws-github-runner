# MiniStack example tests

The MiniStack workflow runs the `base`, `prebuilt`, `default`, `ephemeral`,
`multi-runner`, `multi-runner-v2`, `microvm-foundation`, and `termination-watcher` examples directly
with Terraform 1.4.0 and the latest Terraform release.
The examples with input variables get their inputs from their own tfvars files
in this directory. The `termination-watcher` example has no input variables
and uses the configuration checked into the example itself. The
`microvm-foundation` lane discovers MiniStack's default VPC and subnet and
generates a temporary tfvars file with a `network_connectors` entry. No
override files or setup module are checked in. The helper creates and removes
a temporary AMI override for `default` and
`ephemeral`, temporary SSM parameters for `multi-runner`, and temporary AMI
fixtures for `multi-runner-v2`.

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
tests/ministack/run-example.sh apply multi-runner-v2
# or
tests/ministack/run-example.sh apply microvm-foundation
# or
tests/ministack/run-example.sh apply termination-watcher
```

The script also supports `init`, `plan`, and `destroy`. It creates inert Lambda
ZIP fixtures in the paths expected by the modules when they are absent, and
removes only the files it created. For `prebuilt`, it seeds AMI metadata through
MiniStack's AWS-compatible EC2 API, then removes only the resources it created
during cleanup. MiniStack v1.5.10 provides the EC2 image behavior needed by
the `default`, `ephemeral`, and `multi-runner` examples and the Lambda Network
Connector API needed by `microvm-foundation`, so they run in the same
lifecycle matrix.
