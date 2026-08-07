variable "config" {
  description = <<-EOF
    Configuration for the job-retry Lambda and retry queue.

    - `aws_partition`: Partition for the base ARN if not `aws`.
    - `architecture`: AWS Lambda architecture. Lambda functions using Graviton processors ('arm64') tend to have better price/performance than 'x86_64' functions.
    - `environment_variables`: Additional environment variables for the job-retry Lambda. Required job-retry variables override matching keys.
    - `enable_organization_runners`: Enable organization runners.
    - `ghes_url`: Optional GitHub Enterprise Server URL.
    - `user_agent`: Optional User-Agent header for GitHub API requests.
    - `github_app_parameters`: SSM parameter metadata for GitHub App credentials.
    - `github_app_parameters.key_base64`: Metadata for the SSM parameter containing the base64-encoded GitHub App private key.
    - `github_app_parameters.key_base64.name`: Name of the private-key parameter supplied to the job-retry Lambda.
    - `github_app_parameters.key_base64.arn`: ARN of the private-key parameter used by the job-retry IAM policy.
    - `github_app_parameters.id`: Metadata for the SSM parameter containing the GitHub App ID.
    - `github_app_parameters.id.name`: Name of the App-ID parameter supplied to the job-retry Lambda.
    - `github_app_parameters.id.arn`: ARN of the App-ID parameter used by the job-retry IAM policy.
    - `kms_key`: Optional customer-managed KMS key used by the job-retry IAM policy. Object presence controls whether the KMS statement exists.
    - `kms_key.arn`: ARN of the customer-managed KMS key. The ARN may be unknown until apply.
    - `lambda_event_source_mapping_batch_size`: Maximum number of records to pass to the lambda function in a single batch for the event source mapping. When not set, the AWS default will be used.
    - `lambda_event_source_mapping_maximum_batching_window_in_seconds`: Maximum amount of time to gather records before invoking the lambda function, in seconds. AWS requires this to be greater than 0 if batch_size is greater than 10.
    - `lambda_tags`: Tags added specifically to the job-retry Lambda function. These override `tags` values with the same key.
    - `log_group_tags`: Tags added specifically to the job-retry Lambda log group. These override `tags` values with the same key.
    - `log_level`: Logging level for lambda logging. Valid values are  'silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'.
    - `log_class`: CloudWatch log-group class for the job-retry Lambda. Supported values are `STANDARD` and `INFREQUENT_ACCESS`.
    - `logging_kms_key_id`: Specifies the kms key id to encrypt the logs with
    - `logging_retention_in_days`: Specifies the number of days you want to retain log events for the lambda log group. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653.
    - `memory_size`: Memory size limit in MB of the lambda.
    - `reserved_concurrent_executions`: Reserved concurrency for the lambda. Use -1 for no reservation.
    - `metrics`: Configuration to enable metrics creation by the lambda.
    - `metrics.enable`: Whether the job-retry Lambda emits metrics.
    - `metrics.namespace`: CloudWatch namespace for metrics emitted by the job-retry Lambda.
    - `metrics.metric`: Controls individual metrics emitted by the job-retry Lambda.
    - `metrics.metric.enable_github_app_rate_limit`: Whether to emit GitHub App rate-limit metrics.
    - `metrics.metric.enable_job_retry`: Whether to emit job-retry metrics.
    - `prefix`: The prefix used for naming resources.
    - `principals`: Extra principals allowed to assume the job-retry Lambda execution role, for example during local testing.
    - `principals[*].type`: IAM principal type, such as `Service` or `AWS`.
    - `principals[*].identifiers`: IAM principal identifiers for the selected principal type.
    - `queue_encryption`: Encryption configuration for the retry queue.
    - `queue_encryption.kms_data_key_reuse_period_seconds`: Length of time, in seconds, for which SQS reuses a data key.
    - `queue_encryption.kms_master_key_id`: KMS key ID used to encrypt the retry queue.
    - `queue_encryption.sqs_managed_sse_enabled`: Whether SQS-managed server-side encryption is enabled.
    - `role_path`: The path that will be added to the role, if not set the environment name will be used.
    - `role_permissions_boundary`: Permissions boundary that will be added to the created role for the lambda.
    - `runner_name_prefix`: Prefix used to identify runners belonging to this runner configuration.
    - `runtime`: AWS Lambda runtime.
    - `s3_bucket`: S3 bucket containing the job-retry Lambda deployment package. This is an alternative to `zip`.
    - `s3_key`: Object key of the job-retry Lambda deployment package. Required when `s3_bucket` is set.
    - `s3_object_version`: Optional version of the job-retry Lambda deployment-package object.
    - `security_group_ids`: List of security group IDs associated with the Lambda function.
    - `sqs_build_queue`: SQS queue to which the job-retry Lambda republishes job requests.
    - `sqs_build_queue.url`: URL of the build queue.
    - `sqs_build_queue.arn`: ARN of the build queue.
    - `queue_tags`: Map of tags that will be added to the retry queue and event-source mapping.
    - `subnet_ids`: Subnets used for the job-retry Lambda VPC configuration.
    - `tags`: Base component tags added to the Lambda function, log group, and execution role. Specialized Lambda and log-group tags override matching keys.
    - `timeout`: Time out of the lambda in seconds.
    - `tracing_config`: Configuration for lambda tracing.
    - `tracing_config.mode`: AWS X-Ray tracing mode. A null value disables tracing.
    - `tracing_config.capture_http_requests`: Whether Powertools tracing captures outgoing HTTP requests.
    - `tracing_config.capture_error`: Whether Powertools tracing captures errors as tracing metadata.
    - `zip`: File location of the lambda zip file.
  EOF
  type = object({
    aws_partition               = optional(string, null)
    architecture                = optional(string, null)
    enable_organization_runners = bool
    environment_variables       = optional(map(string), {})
    ghes_url                    = optional(string, null)
    user_agent                  = optional(string, null)
    github_app_parameters = object({
      key_base64 = map(string)
      id         = map(string)
    })
    kms_key = optional(object({
      arn = string
    }), null)
    lambda_event_source_mapping_batch_size                         = optional(number, 10)
    lambda_event_source_mapping_maximum_batching_window_in_seconds = optional(number, 0)
    lambda_tags                                                    = optional(map(string), {})
    log_group_tags                                                 = optional(map(string), {})
    log_level                                                      = optional(string, null)
    log_class                                                      = optional(string, "STANDARD")
    logging_kms_key_id                                             = optional(string, null)
    logging_retention_in_days                                      = optional(number, null)
    memory_size                                                    = optional(number, null)
    reserved_concurrent_executions                                 = optional(number, null)
    metrics = optional(object({
      enable    = optional(bool, false)
      namespace = optional(string, null)
      metric = optional(object({
        enable_github_app_rate_limit = optional(bool, true)
        enable_job_retry             = optional(bool, true)
      }), {})
    }), {})
    prefix = optional(string, null)
    principals = optional(list(object({
      type        = string
      identifiers = list(string)
    })), [])
    queue_encryption = optional(object({
      kms_data_key_reuse_period_seconds = optional(number, null)
      kms_master_key_id                 = optional(string, null)
      sqs_managed_sse_enabled           = optional(bool, true)
    }), {})
    role_path                 = optional(string, null)
    role_permissions_boundary = optional(string, null)
    runner_name_prefix        = optional(string, "")
    runtime                   = optional(string, null)
    security_group_ids        = optional(list(string), [])
    subnet_ids                = optional(list(string), [])
    s3_bucket                 = optional(string, null)
    s3_key                    = optional(string, null)
    s3_object_version         = optional(string, null)
    sqs_build_queue = object({
      url = string
      arn = string
    })
    queue_tags = optional(map(string), {})
    tags       = optional(map(string), {})
    timeout    = optional(number, 30)
    tracing_config = optional(object({
      mode                  = optional(string, null)
      capture_http_requests = optional(bool, false)
      capture_error         = optional(bool, false)
    }), {})
    zip = optional(string, null)
  })

  validation {
    condition     = contains(["arm64", "x86_64"], coalesce(var.config.architecture, "arm64"))
    error_message = "config.architecture must be arm64 or x86_64."
  }

  validation {
    condition = contains([
      "silly",
      "trace",
      "debug",
      "info",
      "warn",
      "error",
      "fatal",
    ], coalesce(var.config.log_level, "info"))
    error_message = "config.log_level must be one of silly, trace, debug, info, warn, error, or fatal."
  }

  validation {
    condition     = var.config.prefix == null ? false : length(var.config.prefix) + length("job-retry") <= 63
    error_message = "config.prefix is required and its length plus job-retry must be less than or equal to 63."
  }
}
