# Multi-runner state migration test

This example keeps the same root module address while switching its
`multi_runner_config` from the v1 contract to the v2 contract. The v1
configuration is at the example root and the v2 configuration is in `v2/`. It enables the
AMI housekeeper, SSM housekeeper, runner-binaries syncer, pool, job retry,
EventBridge, metrics, tracing, termination watcher, and the EC2 runner
features that exercise the v1-to-v2 resource topology.

The MiniStack lifecycle test performs this sequence without editing the
example files:

1. Apply the root configuration with `v1.tfvars`.
2. Run `scripts/migrate_multi_runner_state.py` against the resulting state.
3. Plan and apply the `v2/` configuration with `v2.tfvars`.
4. Assert that the v2 plan is empty.

Run it with:

```sh
tests/ministack/run-example.sh apply migration-test
```
