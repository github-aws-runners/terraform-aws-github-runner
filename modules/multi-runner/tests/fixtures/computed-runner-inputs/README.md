<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.3 |
| <a name="requirement_random"></a> [random](#requirement\_random) | ~> 3.0 |

## Providers

| Name | Version |
| ---- | ------- |
| <a name="provider_random"></a> [random](#provider\_random) | ~> 3.0 |

## Modules

| Name | Source | Version |
| ---- | ------ | ------- |
| <a name="module_multi_runner"></a> [multi\_runner](#module\_multi\_runner) | ../../.. | n/a |

## Resources

| Name | Type |
| ---- | ---- |
| [random_id.managed_policy](https://registry.terraform.io/providers/hashicorp/random/latest/docs/resources/id) | resource |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| <a name="input_enable_runner_binaries_syncer"></a> [enable\_runner\_binaries\_syncer](#input\_enable\_runner\_binaries\_syncer) | n/a | `bool` | `false` | no |
| <a name="input_runner_binary_targets"></a> [runner\_binary\_targets](#input\_runner\_binary\_targets) | n/a | <pre>map(object({<br/>    os           = string<br/>    architecture = string<br/>  }))</pre> | `{}` | no |

## Outputs

| Name | Description |
| ---- | ----------- |
| <a name="output_binaries_syncer_keys"></a> [binaries\_syncer\_keys](#output\_binaries\_syncer\_keys) | n/a |
| <a name="output_runner_config_keys"></a> [runner\_config\_keys](#output\_runner\_config\_keys) | n/a |
<!-- END_TF_DOCS -->
