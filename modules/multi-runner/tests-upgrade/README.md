# Multi-runner upgrade tests

These tests use Terraform 1.14 state sharing to apply a pre-provider-boundary fixture, plan the current module against the same in-memory state, and verify that EC2 runner, pool, and IAM resource identities survive the module move.

Run them separately from the minimum-version module checks:

```shell
terraform init -backend=false -input=false -test-directory=tests-upgrade
terraform test -test-directory=tests-upgrade
```
