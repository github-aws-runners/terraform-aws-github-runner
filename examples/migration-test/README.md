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
2. Run `scripts/migrate_multi_runner_state.py` against the resulting v1 state.
3. Plan and apply the `v2/` configuration with `v2.tfvars` using the shared
   `migration.tfstate` file.
4. Assert that the v2 plan is empty.

Run it with:

```sh
tests/ministack/run-example.sh apply migration-test
```

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.5.6 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.33 |
| <a name="requirement_random"></a> [random](#requirement\_random) | ~> 3.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_random"></a> [random](#provider\_random) | 3.9.1 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_base"></a> [base](#module\_base) | ../base | n/a |
| <a name="module_runners"></a> [runners](#module\_runners) | ../../modules/multi-runner | n/a |
| <a name="module_webhook_github_app"></a> [webhook\_github\_app](#module\_webhook\_github\_app) | ../../modules/webhook-github-app | n/a |

## Resources

| Name | Type |
|------|------|
| [random_id.webhook_secret](https://registry.terraform.io/providers/hashicorp/random/latest/docs/resources/id) | resource |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region. | `string` | `"eu-west-1"` | no |
| <a name="input_environment"></a> [environment](#input\_environment) | Environment name used as the resource prefix. | `string` | `"migration-test"` | no |
| <a name="input_github_app"></a> [github\_app](#input\_github\_app) | Test-only GitHub App values used by the MiniStack fixture. | <pre>object({<br/>    id         = string<br/>    key_base64 = string<br/>  })</pre> | n/a | yes |

## Outputs

No outputs.
<!-- END_TF_DOCS -->
