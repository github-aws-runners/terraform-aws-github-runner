# MiniStack example tests

The MiniStack workflow runs the `base`, `default`, `ephemeral`, `multi-runner`,
`prebuilt`, and `termination-watcher` examples directly with
Terraform. Each example gets its inputs from its own tfvars file in this
directory; no override files, setup module, temporary archive, or generated
Terraform configuration is used.

Start MiniStack, set the AWS endpoint and test credentials, then run:

```sh
tests/ministack/run-example.sh apply base
# or
tests/ministack/run-example.sh apply ephemeral
# or
tests/ministack/run-example.sh apply default
# or
tests/ministack/run-example.sh apply prebuilt
# or
tests/ministack/run-example.sh apply termination-watcher
# or
tests/ministack/run-example.sh apply multi-runner
```

The script also supports `init`, `plan`, and `destroy`. The Lambda variables
point to the inert MiniStack test archive in this directory. The remaining
examples stay outside this workflow because they require externally managed
SSM parameters or remote state.
