# MiniStack example tests

The MiniStack workflow runs the `base`, `prebuilt`, and `termination-watcher` examples directly with
Terraform. The `base` and `prebuilt` examples get their inputs from their own
tfvars files in this directory. The `termination-watcher` example has no input
variables and uses the configuration checked into the example itself. No
override files, setup module, or generated Terraform fixture configuration is
used.

Start MiniStack, set the AWS endpoint and test credentials, then run:

```sh
tests/ministack/run-example.sh apply base
# or
tests/ministack/run-example.sh apply prebuilt
# or
tests/ministack/run-example.sh apply termination-watcher
```

The script also supports `init`, `plan`, and `destroy`. It creates inert Lambda
ZIP fixtures in the paths expected by the modules when they are absent, and
removes only the files it created. For `prebuilt`, it seeds AMI metadata through
MiniStack's AWS-compatible EC2 API, then removes only the resources it created
during cleanup. The `default`, `ephemeral`, and `multi-runner` examples stay
outside this workflow because their current example configuration does not
expose the AMI/configuration choices needed for a tfvars-only MiniStack test.
