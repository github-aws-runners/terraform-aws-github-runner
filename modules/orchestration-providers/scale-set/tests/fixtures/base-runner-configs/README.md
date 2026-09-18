<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.5.6 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.33 |

## Providers

No providers.

## Modules

No modules.

## Resources

No resources.

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| <a name="input_runner_configs"></a> [runner\_configs](#input\_runner\_configs) | Base runner configuration fixture forwarded to the scale-set tests. | `any` | n/a | yes |

## Outputs

| Name | Description |
| ---- | ----------- |
| <a name="output_runner_configs"></a> [runner\_configs](#output\_runner\_configs) | Base runner configuration fixture for later test runs. |
<!-- END_TF_DOCS -->
