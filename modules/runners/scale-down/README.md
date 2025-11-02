# Module - Scale Down

The scale down lambda is triggered via a CloudWatch event. The event is triggered by a cron expression defined in the variable `scale_down_schedule_expression` (https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html). For scaling down GitHub does not provide a good API yet, therefore we run the scaling down based on this event every x minutes. Each time the lambda is triggered it tries to remove all runners older than x minutes (configurable) managed in this deployment. In case the runner can be removed from GitHub, which means it is not executing a workflow, the lambda will terminate the EC2 instance.

## Multi-Environment Support

This module supports managing multiple runner environments (configurations) from a single Lambda function. When multiple environments are configured, the Lambda processes all environments sequentially in a single invocation. GitHub API calls are cached by organization/repository owner during the Lambda execution. When multiple environments share the same GitHub organization or repository, the list of runners is fetched from the GitHub API once and reused across those environments.

--8<-- "modules/runners/scale-down/scale-down-state-diagram.md:mkdocs_scale_down_state_diagram"

<!-- BEGIN_TF_DOCS -->
## Requirements

No requirements.

## Providers

| Name | Version |
|------|---------|
| <a name="provider_aws"></a> [aws](#provider\_aws) | n/a |

## Modules

No modules.

## Resources

| Name | Type |
|------|------|
| [aws_cloudwatch_event_rule.scale_down](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_rule) | resource |
| [aws_cloudwatch_event_target.scale_down](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_target) | resource |
| [aws_cloudwatch_log_group.scale_down](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_iam_role.scale_down](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role_policy.scale_down](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.scale_down_logging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.scale_down_xray](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy_attachment.scale_down_vpc_execution_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_lambda_function.scale_down](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function) | resource |
| [aws_lambda_permission.scale_down](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [aws_ssm_parameter.scale_down_config](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ssm_parameter) | resource |
| [aws_caller_identity.current](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/caller_identity) | data source |
| [aws_iam_policy_document.lambda_assume_role_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.lambda_xray](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_region.current](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/region) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_aws_partition"></a> [aws\_partition](#input\_aws\_partition) | AWS partition | `string` | n/a | yes |
| <a name="input_environments"></a> [environments](#input\_environments) | List of environment configurations for scale-down | <pre>list(object({<br/>    environment                     = string<br/>    idle_config                     = list(object({<br/>      cron             = string<br/>      timeZone         = string<br/>      idleCount        = number<br/>      evictionStrategy = optional(string, "oldest_first")<br/>    }))<br/>    minimum_running_time_in_minutes = number<br/>    runner_boot_time_in_minutes     = number<br/>  }))</pre> | n/a | yes |
| <a name="input_ghes_ssl_verify"></a> [ghes\_ssl\_verify](#input\_ghes\_ssl\_verify) | Verify GitHub Enterprise Server SSL certificate | `bool` | `true` | no |
| <a name="input_ghes_url"></a> [ghes\_url](#input\_ghes\_url) | GitHub Enterprise Server URL | `string` | `null` | no |
| <a name="input_github_app_parameters"></a> [github\_app\_parameters](#input\_github\_app\_parameters) | GitHub App SSM parameters | <pre>object({<br/>    id = object({<br/>      name = string<br/>      arn  = string<br/>    })<br/>    key_base64 = object({<br/>      name = string<br/>      arn  = string<br/>    })<br/>  })</pre> | n/a | yes |
| <a name="input_kms_key_arn"></a> [kms\_key\_arn](#input\_kms\_key\_arn) | KMS key ARN for SSM parameter decryption | `string` | `""` | no |
| <a name="input_lambda_architecture"></a> [lambda\_architecture](#input\_lambda\_architecture) | Lambda architecture (x86\_64 or arm64) | `string` | n/a | yes |
| <a name="input_lambda_memory_size"></a> [lambda\_memory\_size](#input\_lambda\_memory\_size) | Lambda memory size in MB | `number` | n/a | yes |
| <a name="input_lambda_runtime"></a> [lambda\_runtime](#input\_lambda\_runtime) | Lambda runtime | `string` | n/a | yes |
| <a name="input_lambda_s3_bucket"></a> [lambda\_s3\_bucket](#input\_lambda\_s3\_bucket) | S3 bucket for Lambda deployment package | `string` | `null` | no |
| <a name="input_lambda_security_group_ids"></a> [lambda\_security\_group\_ids](#input\_lambda\_security\_group\_ids) | List of security group IDs for Lambda VPC configuration | `list(string)` | `[]` | no |
| <a name="input_lambda_subnet_ids"></a> [lambda\_subnet\_ids](#input\_lambda\_subnet\_ids) | List of subnet IDs for Lambda VPC configuration | `list(string)` | `[]` | no |
| <a name="input_lambda_tags"></a> [lambda\_tags](#input\_lambda\_tags) | Tags for Lambda function | `map(string)` | `{}` | no |
| <a name="input_lambda_timeout"></a> [lambda\_timeout](#input\_lambda\_timeout) | Lambda timeout in seconds | `number` | n/a | yes |
| <a name="input_lambda_zip"></a> [lambda\_zip](#input\_lambda\_zip) | Path to Lambda deployment package | `string` | n/a | yes |
| <a name="input_log_level"></a> [log\_level](#input\_log\_level) | Log level for Lambda function | `string` | `"info"` | no |
| <a name="input_logging_kms_key_id"></a> [logging\_kms\_key\_id](#input\_logging\_kms\_key\_id) | KMS key ID for CloudWatch log encryption | `string` | `null` | no |
| <a name="input_logging_retention_in_days"></a> [logging\_retention\_in\_days](#input\_logging\_retention\_in\_days) | CloudWatch log retention in days | `number` | n/a | yes |
| <a name="input_metrics"></a> [metrics](#input\_metrics) | Metrics configuration | <pre>object({<br/>    enable    = optional(bool, false)<br/>    namespace = optional(string, "GitHub Runners")<br/>    metric    = optional(object({<br/>      enable_github_app_rate_limit = optional(bool, true)<br/>    }), {})<br/>  })</pre> | `{}` | no |
| <a name="input_prefix"></a> [prefix](#input\_prefix) | Prefix for Lambda function name | `string` | n/a | yes |
| <a name="input_role_path"></a> [role\_path](#input\_role\_path) | IAM role path | `string` | n/a | yes |
| <a name="input_role_permissions_boundary"></a> [role\_permissions\_boundary](#input\_role\_permissions\_boundary) | IAM role permissions boundary ARN | `string` | `null` | no |
| <a name="input_runners_lambda_s3_key"></a> [runners\_lambda\_s3\_key](#input\_runners\_lambda\_s3\_key) | S3 key for Lambda deployment package | `string` | `null` | no |
| <a name="input_runners_lambda_s3_object_version"></a> [runners\_lambda\_s3\_object\_version](#input\_runners\_lambda\_s3\_object\_version) | S3 object version for Lambda deployment package | `string` | `null` | no |
| <a name="input_scale_down_parameter_store_tier"></a> [scale\_down\_parameter\_store\_tier](#input\_scale\_down\_parameter\_store\_tier) | SSM Parameter Store tier to use for persisted scale-down configuration. | `string` | `"Standard"` | no |
| <a name="input_schedule_expression"></a> [schedule\_expression](#input\_schedule\_expression) | CloudWatch Event schedule expression | `string` | `"cron(*/5 * * * ? *)"` | no |
| <a name="input_ssm_parameter_path_prefix"></a> [ssm\_parameter\_path\_prefix](#input\_ssm\_parameter\_path\_prefix) | Base SSM parameter path prefix used to store scale-down configuration (without environment suffix). | `string` | n/a | yes |
| <a name="input_tags"></a> [tags](#input\_tags) | Tags to apply to resources | `map(string)` | `{}` | no |
| <a name="input_tracing_config"></a> [tracing\_config](#input\_tracing\_config) | Lambda tracing configuration | <pre>object({<br/>    mode                      = optional(string, null)<br/>    capture_http_requests     = optional(bool, false)<br/>    capture_error             = optional(bool, false)<br/>  })</pre> | `{}` | no |
| <a name="input_user_agent"></a> [user\_agent](#input\_user\_agent) | User agent string for GitHub API requests | `string` | `null` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_cloudwatch_event_rule"></a> [cloudwatch\_event\_rule](#output\_cloudwatch\_event\_rule) | CloudWatch Event Rule for scale-down |
| <a name="output_lambda"></a> [lambda](#output\_lambda) | Scale-down Lambda function |
| <a name="output_lambda_log_group"></a> [lambda\_log\_group](#output\_lambda\_log\_group) | Scale-down Lambda log group |
| <a name="output_role"></a> [role](#output\_role) | Scale-down Lambda IAM role |
| <a name="output_ssm_parameters"></a> [ssm\_parameters](#output\_ssm\_parameters) | Scale-down configuration parameters stored in SSM |
<!-- END_TF_DOCS -->
