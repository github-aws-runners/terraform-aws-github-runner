# Module - Lambda

> This module is treated as internal module, breaking changes will not trigger a major release bump.

Generica module to create lambda functions 

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
| [aws_cloudwatch_log_group.main](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_iam_role.main](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role_policy.lambda_logging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.xray](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy_attachment.vpc_execution_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_lambda_function.main](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function) | resource |
| [aws_iam_policy_document.lambda_assume_role_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.lambda_xray](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_lambda"></a> [lambda](#input\_lambda) | Configuration for the lambda function.<br><br>`aws_partition`: Partition for the base arn if not 'aws'<br>`architecture`: AWS Lambda architecture. Lambda functions using Graviton processors ('arm64') tend to have better price/performance than 'x86\_64' functions.<br>`environment_variables`: Environment variables for the lambda.<br>`handler`: The entrypoint for the lambda.<br>`principals`: Add extra principals to the role created for execution of the lambda, e.g. for local testing.<br>`lambda_tags`: Map of tags that will be added to created resources. By default resources will be tagged with name and environment.<br>`log_level`: Logging level for lambda logging. Valid values are  'silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'.<br>`logging_kms_key_id`: Specifies the kms key id to encrypt the logs with<br>`logging_retention_in_days`: Specifies the number of days you want to retain log events for the lambda log group. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653.<br>`memory_size`: Memory size linit in MB of the lambda.<br>`metrics_namespace`: Namespace for the metrics emitted by the lambda.<br>`name`: The name of the lambda function.<br>`prefix`: The prefix used for naming resources.<br>`role_path`: The path that will be added to the role, if not set the environment name will be used.<br>`role_permissions_boundary`: Permissions boundary that will be added to the created role for the lambda.<br>`runtime`: AWS Lambda runtime.<br>`s3_bucket`: S3 bucket from which to specify lambda functions. This is an alternative to providing local files directly.<br>`s3_key`: S3 key for syncer lambda function. Required if using S3 bucket to specify lambdas.<br>`s3_object_version`: S3 object version for syncer lambda function. Useful if S3 versioning is enabled on source bucket.<br>`security_group_ids`: List of security group IDs associated with the Lambda function.<br>`subnet_ids`: List of subnets in which the action runners will be launched, the subnets needs to be subnets in the `vpc_id`.<br>`tags`: Map of tags that will be added to created resources. By default resources will be tagged with name and environment.<br>`timeout`: Time out of the lambda in seconds.<br>`tracing_config`: Configuration for lambda tracing.<br>`zip`: File location of the lambda zip file. | <pre>object({<br>    aws_partition             = optional(string, "aws")<br>    architecture              = optional(string, "arm64")<br>    environment_variables     = optional(map(string), {})<br>    handler                   = string<br>    lambda_tags               = optional(map(string), {})<br>    log_level                 = optional(string, "info")<br>    logging_kms_key_id        = optional(string, null)<br>    logging_retention_in_days = optional(number, 180)<br>    memory_size               = optional(number, 256)<br>    metrics_namespace         = optional(string, "GitHub Runners")<br>    name                      = string<br>    prefix                    = optional(string, null)<br>    principals = optional(list(object({<br>      type        = string<br>      identifiers = list(string)<br>    })), [])<br>    role_path                 = optional(string, null)<br>    role_permissions_boundary = optional(string, null)<br>    runtime                   = optional(string, "nodejs20.x")<br>    s3_bucket                 = optional(string, null)<br>    s3_key                    = optional(string, null)<br>    s3_object_version         = optional(string, null)<br>    security_group_ids        = optional(list(string), [])<br>    subnet_ids                = optional(list(string), [])<br>    tags                      = optional(map(string), {})<br>    timeout                   = optional(number, 60)<br>    tracing_config = optional(object({<br>      mode                  = optional(string, null)<br>      capture_http_requests = optional(bool, false)<br>      capture_error         = optional(bool, false)<br>    }), {})<br>    zip = optional(string, null)<br>  })</pre> | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_lambda"></a> [lambda](#output\_lambda) | n/a |
<!-- END_TF_DOCS -->
