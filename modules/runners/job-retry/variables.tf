variable "config" {
  description = <<-EOF
    Configuration for the spot termination watcher lambda function.

    `aws_partition`: Partition for the base arn if not 'aws'
    `architecture`: AWS Lambda architecture. Lambda functions using Graviton processors ('arm64') tend to have better price/performance than 'x86_64' functions.
    `environment_variables`: Environment variables for the lambda.
    `enable_metric`: Enable metric for the lambda. If `spot_warning` is set to true, the lambda will emit a metric when it detects a spot termination warning.
    'ghes_url': Optional GitHub Enterprise Server URL.
    'github_app_parameters': Parameter Store for GitHub App Parameters.
    'kms_key_arn': Optional CMK Key ARN instead of using the default AWS managed key.
    `lambda_principals`: Add extra principals to the role created for execution of the lambda, e.g. for local testing.
    `lambda_tags`: Map of tags that will be added to created resources. By default resources will be tagged with name and environment.
    `log_level`: Logging level for lambda logging. Valid values are  'silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'.
    `logging_kms_key_id`: Specifies the kms key id to encrypt the logs with
    `logging_retention_in_days`: Specifies the number of days you want to retain log events for the lambda log group. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653.
    `memory_size`: Memory size linit in MB of the lambda.
    `metrics_config`: Configuraiton to enable metrics creation by the lambda.
    `prefix`: The prefix used for naming resources.
    `role_path`: The path that will be added to the role, if not set the environment name will be used.
    `role_permissions_boundary`: Permissions boundary that will be added to the created role for the lambda.
    `runtime`: AWS Lambda runtime.
    `s3_bucket`: S3 bucket from which to specify lambda functions. This is an alternative to providing local files directly.
    `s3_key`: S3 key for syncer lambda function. Required if using S3 bucket to specify lambdas.
    `s3_object_version`: S3 object version for syncer lambda function. Useful if S3 versioning is enabled on source bucket.
    `security_group_ids`: List of security group IDs associated with the Lambda function.
    'sqs_build_queue': SQS queue for build events to re-publish job request.
    `subnet_ids`: List of subnets in which the action runners will be launched, the subnets needs to be subnets in the `vpc_id`.
    `tag_filters`: Map of tags that will be used to filter the resources to be tracked. Only for which all tags are present and starting with the same value as the value in the map will be tracked.
    `tags`: Map of tags that will be added to created resources. By default resources will be tagged with name and environment.
    `timeout`: Time out of the lambda in seconds.
    `tracing_config`: Configuration for lambda tracing.
    `zip`: File location of the lambda zip file.
  EOF
  type = object({
    aws_partition               = optional(string, null)
    architecture                = optional(string, null)
    enable_organization_runners = bool
    environment_variables       = optional(map(string), {})
    ghes_url                    = optional(string, null)
    github_app_parameters = object({
      key_base64 = map(string)
      id         = map(string)
    })
    kms_key_arn               = optional(string, null)
    lambda_tags               = optional(map(string), {})
    log_level                 = optional(string, null)
    logging_kms_key_id        = optional(string, null)
    logging_retention_in_days = optional(number, null)
    memory_size               = optional(number, null)
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
    runtime                   = optional(string, null)
    s3_bucket                 = optional(string, null)
    s3_key                    = optional(string, null)
    s3_object_version         = optional(string, null)
    sqs_build_queue = object({
      url = string
      arn = string
    })
    tags    = optional(map(string), {})
    timeout = optional(number, 30)
    tracing_config = optional(object({
      mode                  = optional(string, null)
      capture_http_requests = optional(bool, false)
      capture_error         = optional(bool, false)
    }), {})
    zip = optional(string, null)
  })
}
