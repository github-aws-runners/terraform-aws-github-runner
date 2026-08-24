<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.10.0 |
| <a name="requirement_archive"></a> [archive](#requirement\_archive) | ~> 2.7 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | = 6.35.1 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_archive"></a> [archive](#provider\_archive) | 2.8.0 |
| <a name="provider_aws"></a> [aws](#provider\_aws) | 6.35.1 |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_ssm_parameter.al2023_arm64](https://registry.terraform.io/providers/hashicorp/aws/6.35.1/docs/resources/ssm_parameter) | resource |
| [aws_ssm_parameter.al2023_x64](https://registry.terraform.io/providers/hashicorp/aws/6.35.1/docs/resources/ssm_parameter) | resource |
| [aws_ssm_parameter.github_app_id](https://registry.terraform.io/providers/hashicorp/aws/6.35.1/docs/resources/ssm_parameter) | resource |
| [aws_ssm_parameter.github_app_key](https://registry.terraform.io/providers/hashicorp/aws/6.35.1/docs/resources/ssm_parameter) | resource |
| [aws_ssm_parameter.github_app_webhook_secret](https://registry.terraform.io/providers/hashicorp/aws/6.35.1/docs/resources/ssm_parameter) | resource |
| [archive_file.lambda](https://registry.terraform.io/providers/hashicorp/archive/latest/docs/data-sources/file) | data source |

## Inputs

No inputs.

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_lambda_archive"></a> [lambda\_archive](#output\_lambda\_archive) | Absolute path to the inert Lambda archive used by the example tests. |
<!-- END_TF_DOCS -->