# Module - DynamoDB Configuration Store

> This module is treated as internal module, breaking changes will not trigger a major release bump.

This module is used for storing configuration of runners, including static parameters and JIT (Just-In-Time) configuration in AWS DynamoDB. The configuration includes runner settings, registration tokens, and instance-specific parameters.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.3.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | ~> 5.27 |

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | ~> 5.27 |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_dynamodb_table.runner_config](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dynamodb_table) | resource |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_table_name"></a> [table\_name](#input\_table\_name) | Name of the DynamoDB table | `string` | `"github-runner-config"` | no |
| <a name="input_tags"></a> [tags](#input\_tags) | Map of tags that will be added to created resources. By default resources will be tagged with name and environment. | `map(string)` | `{}` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_table_name"></a> [table\_name](#output\_table\_name) | The name of the DynamoDB table |
| <a name="output_table_arn"></a> [table\_arn](#output\_table\_arn) | The ARN of the DynamoDB table |

## Table Structure

The DynamoDB table uses a composite key structure:
- Partition Key: `instance_id` (String)
- Sort Key: `config_type` (String)

### Configuration Types

1. Static Configuration (`config_type = "static"`):
```json
{
  &quot;instance_id&quot;: &quot;i-1234567890abcdef0&quot;,
  &quot;config_type&quot;: &quot;static&quot;,
  &quot;config_value&quot;: {
    &quot;runner_user&quot;: &quot;github-runner&quot;,
    &quot;enable_cloudwatch&quot;: true
  },
  &quot;ttl&quot;: 1728000
}
