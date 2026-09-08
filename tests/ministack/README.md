# MiniStack example tests

The MiniStack workflow runs the `base`, `prebuilt`, `default`, `ephemeral`,
`multi-runner`, `multi-runner-v2`, `microvm-foundation`, `microvm`, and
`termination-watcher` examples directly
with Terraform 1.4.0 and the latest Terraform release.
The examples with input variables get their inputs from their own tfvars files
in this directory. The `termination-watcher` example has no input variables
and uses the configuration checked into the example itself. The
`microvm-foundation` lane uses an isolated tfvars file with no network
connectors because MiniStack does not provide the regional Lambda Network
Connector API. No override files or setup module are checked in. The helper
creates and removes a temporary AMI override for `default` and
`ephemeral`, temporary SSM parameters for `multi-runner`, and temporary AMI
fixtures plus an override for `multi-runner-v2`.
The `microvm` lane seeds test-only GitHub App SSM parameters and Lambda ZIP
objects in a temporary S3 bucket, and uses synthetic MicroVM image and network
connector ARNs. It does not create a real MicroVM image or network connector.

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
tests/ministack/run-example.sh apply microvm
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
