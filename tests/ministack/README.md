# MiniStack example tests

The MiniStack workflow runs the `base`, `prebuilt`, `default`, `ephemeral`,
`multi-runner`, `multi-runner-v2`, `multi-runner-scale-set`, and
`termination-watcher` examples directly
with Terraform 1.4.0 and the latest Terraform release.
The examples with input variables get their inputs from their own tfvars files
in this directory. The `termination-watcher` example has no input variables
and uses the configuration checked into the example itself. No override files,
setup module, or Terraform fixture configuration is checked in. The helper
creates and removes a temporary AMI override for `default` and
`ephemeral`, temporary SSM parameters for `multi-runner`, and temporary AMI
fixtures plus an override for `multi-runner-v2` and `multi-runner-scale-set`.

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
tests/ministack/run-example.sh apply multi-runner-scale-set
# or
tests/ministack/run-example.sh apply termination-watcher
```

The script also supports `init`, `plan`, and `destroy`. It creates inert Lambda
ZIP fixtures in the paths expected by the modules when they are absent, and
removes only the files it created. For `prebuilt`, it seeds AMI metadata through
MiniStack's AWS-compatible EC2 API, then removes only the resources it created
during cleanup. MiniStack v1.5.7 provides the EC2 image behavior needed by the
`default`, `ephemeral`, `multi-runner`, and `multi-runner-scale-set` examples,
so they are included in the same lifecycle matrix.
