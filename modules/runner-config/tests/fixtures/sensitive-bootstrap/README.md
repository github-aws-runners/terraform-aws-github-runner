<!-- BEGIN_TF_DOCS -->
## Requirements

No requirements.

## Providers

| Name | Version |
|------|---------|
| <a name="provider_terraform"></a> [terraform](#provider\_terraform) | n/a |

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_runner"></a> [runner](#module\_runner) | ../../.. | n/a |

## Resources

| Name | Type |
|------|------|
| [terraform_data.bootstrap](https://registry.terraform.io/providers/hashicorp/terraform/latest/docs/resources/data) | resource |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_computed_bootstrap"></a> [computed\_bootstrap](#input\_computed\_bootstrap) | n/a | `bool` | `false` | no |
| <a name="input_user_data"></a> [user\_data](#input\_user\_data) | Apply sensitivity inside the fixture: OpenTofu cannot serialize nested sensitive values supplied directly by a test variables block. | `map(string)` | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_provider_type"></a> [provider\_type](#output\_provider\_type) | n/a |
| <a name="output_user_data_sensitive"></a> [user\_data\_sensitive](#output\_user\_data\_sensitive) | n/a |
<!-- END_TF_DOCS -->