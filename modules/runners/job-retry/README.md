# Module - Job Retry

This module is listening to a SQS queue where the scale-up lambda publishes messages for jobs that needs to trigger a retry if still queued. The job retry module lambda function is handling the messages, checking if the job is queued. Next for queued jobs a message is published to the build queue for the scale-up lambda. The scale-up lambda will handle the message as any other workflow job event.

## Usages

The module is an inner module and used by the runner module when the opt-in feature for job retry is enabled. The module is not intended to be used standalone.


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

| Name | Source | Version |
|------|--------|---------|
| <a name="module_job_retry"></a> [job\_retry](#module\_job\_retry) | ../../lambda | n/a |

## Resources

| Name | Type |
|------|------|
| [aws_iam_role_policy.job_retry](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy) | resource |
| [aws_lambda_event_source_mapping.job_retry](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_event_source_mapping) | resource |
| [aws_lambda_permission.job_retry](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission) | resource |
| [aws_sqs_queue.job_retry_check_queue](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue) | resource |
| [aws_sqs_queue_policy.job_retry_check_queue_policy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue_policy) | resource |
| [aws_iam_policy_document.deny_unsecure_transport](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| <a name="input_config"></a> [config](#input\_config) | Configuration for the spot termination watcher lambda function.<br><br>`aws_partition`: Partition for the base arn if not 'aws'<br>`architecture`: AWS Lambda architecture. Lambda functions using Graviton processors ('arm64') tend to have better price/performance than 'x86\_64' functions.<br>`environment_variables`: Environment variables for the lambda.<br>`enable_metric`: Enable metric for the lambda. If `spot_warning` is set to true, the lambda will emit a metric when it detects a spot termination warning.<br>'ghes\_url': Optional GitHub Enterprise Server URL.<br>'github\_app\_parameters': Parameter Store for GitHub App Parameters.<br>'kms\_key\_arn': Optional CMK Key ARN instead of using the default AWS managed key.<br>`lambda_principals`: Add extra principals to the role created for execution of the lambda, e.g. for local testing.<br>`lambda_tags`: Map of tags that will be added to created resources. By default resources will be tagged with name and environment.<br>`log_level`: Logging level for lambda logging. Valid values are  'silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'.<br>`logging_kms_key_id`: Specifies the kms key id to encrypt the logs with<br>`logging_retention_in_days`: Specifies the number of days you want to retain log events for the lambda log group. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653.<br>`memory_size`: Memory size linit in MB of the lambda.<br>`metrics_config`: Configuraiton to enable metrics creation by the lambda.<br>`prefix`: The prefix used for naming resources.<br>`role_path`: The path that will be added to the role, if not set the environment name will be used.<br>`role_permissions_boundary`: Permissions boundary that will be added to the created role for the lambda.<br>`runtime`: AWS Lambda runtime.<br>`s3_bucket`: S3 bucket from which to specify lambda functions. This is an alternative to providing local files directly.<br>`s3_key`: S3 key for syncer lambda function. Required if using S3 bucket to specify lambdas.<br>`s3_object_version`: S3 object version for syncer lambda function. Useful if S3 versioning is enabled on source bucket.<br>`security_group_ids`: List of security group IDs associated with the Lambda function.<br>'sqs\_build\_queue': SQS queue for build events to re-publish job request.<br>`subnet_ids`: List of subnets in which the action runners will be launched, the subnets needs to be subnets in the `vpc_id`.<br>`tag_filters`: Map of tags that will be used to filter the resources to be tracked. Only for which all tags are present and starting with the same value as the value in the map will be tracked.<br>`tags`: Map of tags that will be added to created resources. By default resources will be tagged with name and environment.<br>`timeout`: Time out of the lambda in seconds.<br>`tracing_config`: Configuration for lambda tracing.<br>`zip`: File location of the lambda zip file. | <pre>object({<br>    aws_partition               = optional(string, null)<br>    architecture                = optional(string, null)<br>    enable_organization_runners = bool<br>    environment_variables       = optional(map(string), {})<br>    ghes_url                    = optional(string, null)<br>    github_app_parameters = object({<br>      key_base64 = map(string)<br>      id         = map(string)<br>    })<br>    kms_key_arn               = optional(string, null)<br>    lambda_tags               = optional(map(string), {})<br>    log_level                 = optional(string, null)<br>    logging_kms_key_id        = optional(string, null)<br>    logging_retention_in_days = optional(number, null)<br>    memory_size               = optional(number, null)<br>    metrics = optional(object({<br>      enable    = optional(bool, false)<br>      namespace = optional(string, null)<br>      metric = optional(object({<br>        enable_github_app_rate_limit = optional(bool, true)<br>        enable_job_retry             = optional(bool, true)<br>      }), {})<br>    }), {})<br>    prefix = optional(string, null)<br>    principals = optional(list(object({<br>      type        = string<br>      identifiers = list(string)<br>    })), [])<br>    queue_encryption = optional(object({<br>      kms_data_key_reuse_period_seconds = optional(number, null)<br>      kms_master_key_id                 = optional(string, null)<br>      sqs_managed_sse_enabled           = optional(bool, true)<br>    }), {})<br>    role_path                 = optional(string, null)<br>    role_permissions_boundary = optional(string, null)<br>    runtime                   = optional(string, null)<br>    s3_bucket                 = optional(string, null)<br>    s3_key                    = optional(string, null)<br>    s3_object_version         = optional(string, null)<br>    sqs_build_queue = object({<br>      url = string<br>      arn = string<br>    })<br>    tags    = optional(map(string), {})<br>    timeout = optional(number, 30)<br>    tracing_config = optional(object({<br>      mode                  = optional(string, null)<br>      capture_http_requests = optional(bool, false)<br>      capture_error         = optional(bool, false)<br>    }), {})<br>    zip = optional(string, null)<br>  })</pre> | n/a | yes |

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_job_retry_check_queue"></a> [job\_retry\_check\_queue](#output\_job\_retry\_check\_queue) | n/a |
| <a name="output_lambda"></a> [lambda](#output\_lambda) | n/a |
<!-- END_TF_DOCS -->
