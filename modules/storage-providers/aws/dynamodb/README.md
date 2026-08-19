# DynamoDB runner-config storage provider

This internal module creates the two shared DynamoDB tables used by an opt-in multi-runner v2 deployment: one durable configuration table and one TTL-enabled runner-state table. It stores global and per-entry configuration under capability-specific partition-key scopes and returns opaque Lambda and runner capabilities with matching least-privilege IAM policies.

The durable table isolates GitHub App credentials, webhook secrets, matcher configuration, runner-group cache entries, and bootstrap records by `scope`. The runner-state table keeps lifecycle inventory under entry-specific scopes and one-time registration configuration under the compute resource's access scope. For EC2, `compute-resource` means the full source-instance ARN; the runner can atomically read and delete only its own unexpired record.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.4.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.33 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | >= 6.33 |
| <a name="provider_terraform"></a> [terraform](#provider\_terraform) | n/a |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_dynamodb_table.config](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dynamodb_table) | resource |
| [aws_dynamodb_table.runner_state](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dynamodb_table) | resource |
| [aws_dynamodb_table_item.github_app_credentials](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dynamodb_table_item) | resource |
| [aws_dynamodb_table_item.github_webhook_secret](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dynamodb_table_item) | resource |
| [aws_dynamodb_table_item.runner_config](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dynamodb_table_item) | resource |
| [aws_dynamodb_table_item.runner_matcher_config](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dynamodb_table_item) | resource |
| [terraform_data.config_version](https://registry.terraform.io/providers/hashicorp/terraform/latest/docs/resources/data) | resource |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_config"></a> [config](#input\_config) | Settings for the shared durable configuration table and ephemeral runner-state table.<br/><br/>- `config.kms_key_arn`: Optional customer-managed KMS key ARN for durable configuration encryption. Null uses the AWS-owned DynamoDB key.<br/>- `config.point_in_time_recovery_enabled`: Enables point-in-time recovery for durable configuration.<br/>- `config.deletion_protection_enabled`: Enables deletion protection for the durable table.<br/>- `config.tags`: Tags applied after the shared tag map.<br/>- `runner_state.kms_key_arn`: Optional customer-managed KMS key ARN for runner-state encryption. Null uses the AWS-owned DynamoDB key.<br/>- `runner_state.point_in_time_recovery_enabled`: Enables point-in-time recovery for ephemeral runner state.<br/>- `runner_state.deletion_protection_enabled`: Enables deletion protection for the runner-state table.<br/>- `runner_state.tags`: Tags applied after the shared tag map. | <pre>object({<br/>    config = object({<br/>      kms_key_arn                    = optional(string, null)<br/>      point_in_time_recovery_enabled = optional(bool, true)<br/>      deletion_protection_enabled    = optional(bool, false)<br/>      tags                           = optional(map(string), {})<br/>    })<br/>    runner_state = object({<br/>      kms_key_arn                    = optional(string, null)<br/>      point_in_time_recovery_enabled = optional(bool, false)<br/>      deletion_protection_enabled    = optional(bool, false)<br/>      tags                           = optional(map(string), {})<br/>    })<br/>  })</pre> | n/a | yes |
| <a name="input_entry_ids"></a> [entry\_ids](#input\_entry\_ids) | Runner-entry identifiers used to build entry-scoped Lambda capabilities. | `set(string)` | n/a | yes |
| <a name="input_entry_records"></a> [entry\_records](#input\_entry\_records) | Resolved durable runner bootstrap configuration keyed by runner-entry identifier. | <pre>map(object({<br/>    run_as                 = string<br/>    agent_mode             = string<br/>    disable_default_labels = bool<br/>    enable_jit_config      = bool<br/>  }))</pre> | n/a | yes |
| <a name="input_global_records"></a> [global\_records](#input\_global\_records) | Terraform-managed values stored under the shared global scope. | <pre>object({<br/>    github_app_credentials = string<br/>    github_webhook_secret  = string<br/>    runner_matcher_config  = string<br/>  })</pre> | n/a | yes |
| <a name="input_prefix"></a> [prefix](#input\_prefix) | Multi-runner prefix used to name the two shared DynamoDB tables. | `string` | n/a | yes |
| <a name="input_runner_config_access_scope_prefixes"></a> [runner\_config\_access\_scope\_prefixes](#input\_runner\_config\_access\_scope\_prefixes) | Per-entry compute-resource scope prefixes used to constrain one-time runner-config writes. | `map(string)` | n/a | yes |
| <a name="input_runner_config_ttl_seconds"></a> [runner\_config\_ttl\_seconds](#input\_runner\_config\_ttl\_seconds) | TTL in seconds for one-time registration and JIT configuration records. | `number` | n/a | yes |
| <a name="input_runner_state_ttl_seconds"></a> [runner\_state\_ttl\_seconds](#input\_runner\_state\_ttl\_seconds) | Safety TTL in seconds applied only while lifecycle records are provisioning or terminating; active and orphan inventory has no expiry. | `number` | n/a | yes |
| <a name="input_tags"></a> [tags](#input\_tags) | Base tags added to both shared DynamoDB tables. Table-specific tags override matching keys. | `map(string)` | `{}` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_capabilities"></a> [capabilities](#output\_capabilities) | Opaque environment and least-privilege IAM additions consumed by the shared webhook and each runner entry's control-plane functions. |
| <a name="output_config_table"></a> [config\_table](#output\_config\_table) | Shared durable configuration table. Global and runner-entry records are separated by the `scope` partition key. |
| <a name="output_runner_state_table"></a> [runner\_state\_table](#output\_runner\_state\_table) | Shared TTL-backed table containing ephemeral runner configuration and provider-neutral runner lifecycle records. |
<!-- END_TF_DOCS -->
