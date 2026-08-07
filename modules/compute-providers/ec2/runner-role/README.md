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
| <a name="input_enable_cloudwatch_agent"></a> [enable\_cloudwatch\_agent](#input\_enable\_cloudwatch\_agent) | Include the CloudWatch agent policy in the runner role contract. | `bool` | n/a | yes |
| <a name="input_enable_runner_binaries_syncer"></a> [enable\_runner\_binaries\_syncer](#input\_enable\_runner\_binaries\_syncer) | Include access to the runner distribution object in the runner role contract. | `bool` | n/a | yes |
| <a name="input_enable_ssm_on_runners"></a> [enable\_ssm\_on\_runners](#input\_enable\_ssm\_on\_runners) | Include Session Manager permissions in the runner role contract. | `bool` | n/a | yes |
| <a name="input_s3_runner_binaries"></a> [s3\_runner\_binaries](#input\_s3\_runner\_binaries) | S3 object containing the cached runner distribution; required when runner binary sync is enabled. | <pre>object({<br/>    arn = string<br/>    key = string<br/>  })</pre> | `null` | no |
| <a name="input_ssm_paths"></a> [ssm\_paths](#input\_ssm\_paths) | SSM paths used for runner tokens and configuration. | <pre>object({<br/>    root   = string<br/>    tokens = string<br/>    config = string<br/>  })</pre> | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_assume_role_policy_json"></a> [assume\_role\_policy\_json](#output\_assume\_role\_policy\_json) | EC2 runner-role trust policy document. |
| <a name="output_inline_policies"></a> [inline\_policies](#output\_inline\_policies) | EC2 runner-role inline policies keyed by stable provider policy identifiers. |
| <a name="output_managed_policy_arns"></a> [managed\_policy\_arns](#output\_managed\_policy\_arns) | EC2 provider-managed runner-role policy ARNs keyed by stable identifiers. |
<!-- END_TF_DOCS -->
