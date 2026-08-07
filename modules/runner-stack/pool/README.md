# Pool module

This module creates the AWS resources required to maintain a pool of runners. However terraform modules are always exposed and theoretically can be used anywhere. This module is seen as a strict inner module.

## Why a submodule for the pool

The pool is an opt-in feature. To be able to use the count on a module level to avoid counts per resources a module is created. All inputs of the module are already defined on a higher level. See the mapping of the variables in [`pool.tf`](../pool.tf)
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
| [aws_cloudwatch_log_group.pool](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group) | resource |
| [aws_iam_role.pool](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role.scheduler](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) | resource |
| [aws_iam_role_policy.pool](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.pool_logging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.pool_xray](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy.scheduler](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_iam_role_policy_attachment.pool_vpc_execution_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_iam_role_policy_attachment.provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy_attachment) | resource |
| [aws_lambda_function.pool](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function) | resource |
| [aws_scheduler_schedule.pool](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/scheduler_schedule) | resource |
| [aws_scheduler_schedule_group.pool](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/scheduler_schedule_group) | resource |
| [aws_iam_policy_document.lambda_assume_role_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.lambda_xray](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.pool](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.pool_common](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.pool_logging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.scheduler](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.scheduler_assume](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_aws_partition"></a> [aws\_partition](#input\_aws\_partition) | (optional) partition for the arn if not 'aws' | `string` | `"aws"` | no |
| <a name="input_config"></a> [config](#input\_config) | Configuration passed from the runner stack to the pool Lambda and scheduler.<br/><br/>- `lambda`: Pool Lambda runtime and deployment configuration.<br/>- `lambda.log_level`: Logging level used by the pool Lambda.<br/>- `lambda.logging_retention_in_days`: Number of days to retain events in the pool Lambda log group.<br/>- `lambda.logging_kms_key_id`: KMS key ID used to encrypt the pool Lambda log group.<br/>- `lambda.log_class`: CloudWatch Logs class for the pool Lambda log group.<br/>- `lambda.reserved_concurrent_executions`: Reserved concurrency for the pool Lambda. Use -1 for no reservation.<br/>- `lambda.s3_bucket`: S3 bucket containing the pool Lambda deployment package.<br/>- `lambda.s3_key`: S3 key of the pool Lambda deployment package.<br/>- `lambda.s3_object_version`: S3 object version of the pool Lambda deployment package.<br/>- `lambda.security_group_ids`: Security group IDs associated with the pool Lambda.<br/>- `lambda.runtime`: AWS Lambda runtime used by the pool Lambda.<br/>- `lambda.architecture`: AWS Lambda architecture used by the pool Lambda.<br/>- `lambda.memory_size`: Memory allocated to the pool Lambda in MB.<br/>- `lambda.timeout`: Pool Lambda timeout in seconds.<br/>- `lambda.zip`: Local path to the pool Lambda deployment package when S3 is not used.<br/>- `lambda.subnet_ids`: Subnet IDs in which the pool Lambda runs.<br/>- `lambda.parameter_store_tags`: JSON-encoded tags supplied to the pool Lambda for SSM parameters it creates.<br/>- `tags`: Common tags added to pool resources.<br/>- `ghes`: GitHub Enterprise Server connection configuration.<br/>- `ghes.url`: GitHub Enterprise Server URL; null when using public GitHub.<br/>- `ghes.ssl_verify`: Whether the pool Lambda verifies the GitHub Enterprise Server TLS certificate.<br/>- `github_app_parameters`: SSM parameter metadata for GitHub App credentials.<br/>- `github_app_parameters.key_base64`: Metadata for the SSM parameter containing the base64-encoded GitHub App private key.<br/>- `github_app_parameters.key_base64.name`: Name of the private-key parameter supplied to the pool Lambda.<br/>- `github_app_parameters.key_base64.arn`: ARN of the private-key parameter used by the pool IAM policy.<br/>- `github_app_parameters.id`: Metadata for the SSM parameter containing the GitHub App ID.<br/>- `github_app_parameters.id.name`: Name of the App-ID parameter supplied to the pool Lambda.<br/>- `github_app_parameters.id.arn`: ARN of the App-ID parameter used by the pool IAM policy.<br/>- `runner`: Runner registration configuration used by the pool Lambda.<br/>- `runner.disable_runner_autoupdate`: Whether GitHub runner automatic updates are disabled.<br/>- `runner.ephemeral`: Whether runners register as ephemeral runners.<br/>- `runner.enable_jit_config`: Whether runners use just-in-time registration configuration.<br/>- `runner.labels`: Labels assigned to runners created by the pool Lambda.<br/>- `runner.group_name`: GitHub runner group assigned to runners created by the pool Lambda.<br/>- `runner.name_prefix`: Prefix used for runner names.<br/>- `runner.pool_owner`: GitHub organization or repository that owns the runner pool.<br/>- `runners_maximum_count`: Maximum number of runners that the pool Lambda may create.<br/>- `prefix`: Prefix used to name pool resources.<br/>- `pool`: Scheduled pool targets.<br/>- `pool[*].schedule_expression`: EventBridge Scheduler expression for a pool target.<br/>- `pool[*].schedule_expression_timezone`: Time zone used to evaluate the schedule expression.<br/>- `pool[*].size`: Desired runner count for the scheduled pool target.<br/>- `include_busy_runners`: Whether busy runners count toward the desired pool size.<br/>- `role_permissions_boundary`: Permissions boundary applied to IAM roles created for the pool.<br/>- `kms_key`: Optional customer-managed KMS key that the pool Lambda may use to decrypt encrypted parameters. Object presence controls whether the KMS statement exists.<br/>- `kms_key.arn`: ARN of the customer-managed KMS key. The ARN may be unknown until apply.<br/>- `role_path`: IAM path applied to roles created for the pool.<br/>- `ssm_token_path`: SSM path under which runner registration tokens are stored.<br/>- `ssm_config_path`: SSM path under which runner configuration is stored.<br/>- `arn_ssm_parameters_path_config`: ARN matching the runner configuration SSM path.<br/>- `lambda_tags`: Tags added specifically to the pool Lambda function, overriding common tags with the same key.<br/>- `log_group_tags`: Tags added specifically to the pool Lambda log group, overriding common tags with the same key.<br/>- `user_agent`: User-Agent header used for GitHub API requests. | <pre>object({<br/>    lambda = object({<br/>      log_level                      = string<br/>      logging_retention_in_days      = number<br/>      logging_kms_key_id             = string<br/>      log_class                      = string<br/>      reserved_concurrent_executions = number<br/>      s3_bucket                      = string<br/>      s3_key                         = string<br/>      s3_object_version              = string<br/>      security_group_ids             = list(string)<br/>      runtime                        = string<br/>      architecture                   = string<br/>      memory_size                    = number<br/>      timeout                        = number<br/>      zip                            = string<br/>      subnet_ids                     = list(string)<br/>      parameter_store_tags           = string<br/>    })<br/>    tags = map(string)<br/>    ghes = object({<br/>      url        = string<br/>      ssl_verify = string<br/>    })<br/>    github_app_parameters = object({<br/>      key_base64 = map(string)<br/>      id         = map(string)<br/>    })<br/>    runner = object({<br/>      disable_runner_autoupdate = bool<br/>      ephemeral                 = bool<br/>      enable_jit_config         = bool<br/>      labels                    = list(string)<br/>      group_name                = string<br/>      name_prefix               = string<br/>      pool_owner                = string<br/>    })<br/>    runners_maximum_count = number<br/>    prefix                = string<br/>    pool = list(object({<br/>      schedule_expression          = string<br/>      schedule_expression_timezone = string<br/>      size                         = number<br/>    }))<br/>    include_busy_runners      = bool<br/>    role_permissions_boundary = string<br/>    kms_key = optional(object({<br/>      arn = string<br/>    }), null)<br/>    role_path                      = string<br/>    ssm_token_path                 = string<br/>    ssm_config_path                = string<br/>    arn_ssm_parameters_path_config = string<br/>    lambda_tags                    = map(string)<br/>    log_group_tags                 = optional(map(string), {})<br/>    user_agent                     = string<br/>  })</pre> | n/a | yes |
| <a name="input_runner_provider"></a> [runner\_provider](#input\_runner\_provider) | Compute provider integration used by the pool Lambda.<br/><br/>- `type`: Compute provider type passed to scheduled pool invocations.<br/>- `environment_variables`: Provider-specific environment variables added to the pool Lambda.<br/>- `iam_policy_json`: Provider-specific IAM policy document merged into the pool Lambda policy.<br/>- `managed_policy_enabled`: Whether to attach a provider-specific managed IAM policy to the pool Lambda role.<br/>- `managed_policy_arn`: ARN of the provider-specific managed IAM policy to attach when enabled. | <pre>object({<br/>    type                   = string<br/>    environment_variables  = map(string)<br/>    iam_policy_json        = string<br/>    managed_policy_enabled = bool<br/>    managed_policy_arn     = optional(string, null)<br/>  })</pre> | n/a | yes |
| <a name="input_tracing_config"></a> [tracing\_config](#input\_tracing\_config) | Tracing configuration for the pool Lambda.<br/><br/>- `mode`: AWS X-Ray tracing mode. A null value disables tracing.<br/>- `capture_http_requests`: Whether Powertools tracing captures outgoing HTTP requests.<br/>- `capture_error`: Whether Powertools tracing captures errors as tracing metadata. | <pre>object({<br/>    mode                  = optional(string, null)<br/>    capture_http_requests = optional(bool, false)<br/>    capture_error         = optional(bool, false)<br/>  })</pre> | `{}` | no |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_pool"></a> [pool](#output\_pool) | Scheduled pool Lambda resources. |
<!-- END_TF_DOCS -->
