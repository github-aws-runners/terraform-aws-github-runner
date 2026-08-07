<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.3 |
| <a name="requirement_random"></a> [random](#requirement\_random) | ~> 3.0 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_random"></a> [random](#provider\_random) | ~> 3.0 |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_external_iam"></a> [external\_iam](#module\_external\_iam) | ../../.. | n/a |
| <a name="module_generated_policy"></a> [generated\_policy](#module\_generated\_policy) | ../../.. | n/a |

## Resources

| Name | Type |
|------|------|
| [random_id.external](https://registry.terraform.io/providers/hashicorp/random/latest/docs/resources/id) | resource |
| [random_id.generated_policy](https://registry.terraform.io/providers/hashicorp/random/latest/docs/resources/id) | resource |

## Inputs

No inputs.

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_external_role_runner_count"></a> [external\_role\_runner\_count](#output\_external\_role\_runner\_count) | n/a |
| <a name="output_generated_policy_role_runner_count"></a> [generated\_policy\_role\_runner\_count](#output\_generated\_policy\_role\_runner\_count) | n/a |
<!-- END_TF_DOCS -->