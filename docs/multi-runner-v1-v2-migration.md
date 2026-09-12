# Migrate multi-runner v1 state to v2

The `scripts/migrate_multi_runner_state.py` utility moves Terraform state
addresses from the multi-runner v1 module layout to the v2
`runner_configs` layout. It does not create, destroy, or modify AWS
resources. It runs the appropriate `state mv` commands so Terraform or
OpenTofu continues managing the existing resources after the configuration is
changed to v2.

This procedure is intended for an existing deployment that uses the
multi-runner v1 configuration.

## Before you start

- Use the migration script from the same repository revision as the v2 module
  configuration you will deploy.
- Schedule a maintenance window and make sure no other Terraform, OpenTofu,
  or Terragrunt operation is running against the state.
- Confirm that the v1 configuration is initialized against the production
  backend and that the backend configuration will remain the same during the
  migration.
- Confirm that every v1 runner configuration is represented in the current
  state. The script discovers dynamic keys from addresses such as
  `module.runners["large"]`; it does not require the keys to be entered on the
  command line.
- Ensure the identity running the command can read and update the state and
  can acquire the backend lock.

The state backup can contain secrets. Store it in a protected location with
encryption and access controls. The script refuses to overwrite an existing
backup path and writes a newly created backup with mode `0600`.

## 1. Plan the migration

Run the normal v1 plan first and confirm that it is understood and safe:

```sh
terraform -chdir="/path/to/terraform-root" init
terraform -chdir="/path/to/terraform-root" plan
```

Run the migration script without `--apply` to produce a dry-run mapping:

```sh
python3 /path/to/terraform-aws-github-runner/scripts/migrate_multi_runner_state.py \
  --working-directory /path/to/terraform-root \
  --tool terraform
```

Review every `source -> target` pair. The script reports the number of runner
keys, mappings, and generated moves. It exits without changing state unless
`--apply` is supplied.

For OpenTofu, use `--tool tofu` and run the equivalent `tofu` commands. For a
Terragrunt-managed root, use `--tool terragrunt` and the directory containing
the Terragrunt configuration.

## 2. Apply the state moves

After reviewing the dry-run output, run the same command with a new backup
path and `--apply`:

```sh
python3 /path/to/terraform-aws-github-runner/scripts/migrate_multi_runner_state.py \
  --working-directory /path/to/terraform-root \
  --tool terraform \
  --backup /path/to/protected-backups/multi-runner-v1-before-state-migration.tfstate \
  --apply
```

Without `--yes`, the script asks for the exact confirmation word `move`.
For an already reviewed, non-interactive run, add `--yes`:

```sh
python3 /path/to/terraform-aws-github-runner/scripts/migrate_multi_runner_state.py \
  --working-directory /path/to/terraform-root \
  --tool terraform \
  --backup /path/to/protected-backups/multi-runner-v1-before-state-migration.tfstate \
  --apply \
  --yes
```

The backup is taken with `<tool> state pull` immediately before the first
move. State moves are executed one at a time. If a move fails, the script
stops and reports that migration is incomplete; do not blindly rerun it.
Inspect the state and the backup first.

The script refuses to continue if a destination address already exists. This
protects against overwriting an existing v2 state object.

## 3. Switch the configuration to v2

After the state move completes, update the root module configuration to the
v2 contract while keeping the same state backend and root module address. Set
the explicit feature flag:

```hcl
experimental_features = ["multi-runner-v2"]
```

Use the v2 `runner_configs` configuration and remove the v1-only configuration
from the root module. Then initialize and plan from the same working
directory:

```sh
terraform -chdir="/path/to/terraform-root" init
terraform -chdir="/path/to/terraform-root" plan -detailed-exitcode
```

The plan should not propose destroying and recreating resources solely because
their module addresses changed. Review any remaining changes carefully; state
migration does not suppress genuine configuration changes, provider drift, or
backend changes. Apply only after the plan is understood:

```sh
terraform -chdir="/path/to/terraform-root" apply
```

Run a second plan and expect exit code `0` for no changes:

```sh
terraform -chdir="/path/to/terraform-root" plan -detailed-exitcode
```

Use the equivalent `tofu` or `terragrunt` commands when those tools manage
the deployment.

!!! warning

    A backend configuration change is a separate operation. If initialization
    reports that the backend changed, stop and resolve the backend migration
    deliberately before running state moves. `init -migrate-state` does not
    replace the v1-to-v2 address migration performed by this script.

## Recovery

If the migration stops part-way through or the post-migration plan is not
acceptable, stop further applies and preserve the current state for
investigation. The backup passed to `--backup` is a snapshot from before the
first move. Restoring it is an operator decision because `state push` can
replace the current remote state:

```sh
terraform -chdir="/path/to/terraform-root" state push \
  /path/to/protected-backups/multi-runner-v1-before-state-migration.tfstate
```

Only restore after confirming the backup is the intended state, no newer
changes must be retained, and the backend is locked. Use `tofu state push` or
`terragrunt state push` for those tools. After a restore, return to the v1
configuration before planning again.

## Command reference

```text
python3 scripts/migrate_multi_runner_state.py [options]

--working-directory PATH  State working directory (default: current directory)
--tool TOOL               terragrunt, terraform, or tofu (default: terragrunt)
--backup PATH             State pull backup path used before --apply
--apply                   Execute the generated state moves
--yes                     Skip the interactive confirmation for --apply
```
