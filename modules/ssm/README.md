# Module - AWS System Manager Parameter store

> This module is treated as internal module, breaking changes will not trigger a major release bump.

This module is used for storing configuration of runners, registration tokens and secrets for the Lambda's in AWS System Manager Parameter store.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.3.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.21 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | >= 6.21 |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_ssm_parameter.enterprise_pat](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) | resource |
| [aws_ssm_parameter.github_app_id](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) | resource |
| [aws_ssm_parameter.github_app_key_base64](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) | resource |
| [aws_ssm_parameter.github_app_webhook_secret](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) | resource |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_enterprise_pat"></a> [enterprise\_pat](#input\_enterprise\_pat) | Enterprise Personal Access Token(s) (PAT) for authenticating with GitHub Enterprise runner management APIs.<br/>  You can either provide the PAT value directly (Terraform creates the SSM parameter) or reference a pre-existing SSM parameter.<br/>  Note: the provided SSM parameter arn and name take precedence over the direct value.<br/><br/>  To distribute API calls across multiple PATs and avoid rate limiting, provide a comma-separated list of PATs<br/>  in the 'pat' field or in the SSM parameter value. The Lambda functions will randomly select one PAT per invocation. | <pre>object({<br/>    pat = optional(string)<br/>    pat_ssm = optional(object({<br/>      arn  = string<br/>      name = string<br/>    }))<br/>  })</pre> | `null` | no |
| <a name="input_github_app"></a> [github\_app](#input\_github\_app) | GitHub app parameters, see your github app.<br/>  You can optionally create the SSM parameters yourself and provide the ARN and name here, through the `*_ssm` attributes.<br/>  If you chose to provide the configuration values directly here,<br/>  please ensure the key is the base64-encoded `.pem` file (the output of `base64 app.private-key.pem`, not the content of `private-key.pem`).<br/>  Note: the provided SSM parameters arn and name have a precedence over the actual value (i.e `key_base64_ssm` has a precedence over `key_base64` etc).<br/><br/>  For enterprise runners, only `webhook_secret` (or `webhook_secret_ssm`) is required.<br/>  The `key_base64` and `id` fields are only needed for org/repo level runners. | <pre>object({<br/>    key_base64 = optional(string)<br/>    key_base64_ssm = optional(object({<br/>      arn  = string<br/>      name = string<br/>    }))<br/>    id = optional(string)<br/>    id_ssm = optional(object({<br/>      arn  = string<br/>      name = string<br/>    }))<br/>    webhook_secret = optional(string)<br/>    webhook_secret_ssm = optional(object({<br/>      arn  = string<br/>      name = string<br/>    }))<br/>  })</pre> | n/a | yes |
| <a name="input_kms_key_arn"></a> [kms\_key\_arn](#input\_kms\_key\_arn) | Optional CMK Key ARN to be used for Parameter Store. | `string` | `null` | no |
| <a name="input_path_prefix"></a> [path\_prefix](#input\_path\_prefix) | The path prefix used for naming resources | `string` | n/a | yes |
| <a name="input_tags"></a> [tags](#input\_tags) | Map of tags that will be added to created resources. By default resources will be tagged with name and environment. | `map(string)` | `{}` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_parameters"></a> [parameters](#output\_parameters) | n/a |
<!-- END_TF_DOCS -->
