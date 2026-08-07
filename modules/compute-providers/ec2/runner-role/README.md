# EC2 runner-role contract

This internal module builds only the EC2-specific IAM documents required by a runner role. The common runner stack consumes these outputs before it creates or selects the shared role, then passes that role to the EC2 compute module. Keeping this module independent from the runner role and EC2 resources prevents a Terraform dependency cycle.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.3.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.33 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | >= 6.33 |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_caller_identity.current](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/caller_identity) | data source |
| [aws_iam_policy_document.assume_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.cloudwatch](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.create_tags](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.describe_tags](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.distribution_bucket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.session_manager](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.ssm_parameters](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.terminate_self](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_aws_partition"></a> [aws\_partition](#input\_aws\_partition) | AWS partition used to build IAM and SSM ARNs. | `string` | `"aws"` | no |
| <a name="input_aws_region"></a> [aws\_region](#input\_aws\_region) | AWS region containing the runner configuration parameters. | `string` | n/a | yes |
| <a name="input_config"></a> [config](#input\_config) | EC2 configuration that controls provider-owned runner policies.<br/><br/>- `cloudwatch_agent.enabled`: Includes the CloudWatch agent policy in the runner-role contract.<br/>- `binaries_syncer.enabled`: Includes access to the synchronized runner distribution.<br/>- `binaries_syncer.s3`: S3 object containing the runner distribution. Required when synchronization is enabled.<br/>- `binaries_syncer.s3.arn`: ARN of the runner-distribution bucket.<br/>- `binaries_syncer.s3.key`: Object key of the runner distribution.<br/>- `ssm_enabled`: Includes Session Manager permissions in the runner-role contract. | <pre>object({<br/>    cloudwatch_agent = optional(object({<br/>      enabled = optional(bool, true)<br/>    }), {})<br/>    binaries_syncer = optional(object({<br/>      enabled = optional(bool, true)<br/>      s3 = optional(object({<br/>        arn = string<br/>        key = string<br/>      }), null)<br/>    }), {})<br/>    ssm_enabled = optional(bool, false)<br/>  })</pre> | n/a | yes |
| <a name="input_ssm"></a> [ssm](#input\_ssm) | Parameter Store configuration used by the EC2 runner-role policies.<br/><br/>- `paths.root`: Root path for this runner stack.<br/>- `paths.tokens`: Path segment containing registration tokens and just-in-time configuration.<br/>- `paths.config`: Path segment containing persistent runner configuration. | <pre>object({<br/>    paths = object({<br/>      root   = string<br/>      tokens = string<br/>      config = string<br/>    })<br/>  })</pre> | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_assume_role_policy_json"></a> [assume\_role\_policy\_json](#output\_assume\_role\_policy\_json) | EC2 runner-role trust policy document. |
| <a name="output_inline_policies"></a> [inline\_policies](#output\_inline\_policies) | EC2 runner-role inline policies keyed by stable provider policy identifiers. |
| <a name="output_managed_policy_arns"></a> [managed\_policy\_arns](#output\_managed\_policy\_arns) | EC2 provider-managed runner-role policy ARNs keyed by stable identifiers. |
<!-- END_TF_DOCS -->
